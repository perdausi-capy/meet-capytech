import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET } from '@/app/api/slots/route';
import { POST as POST_CONFIG } from '@/app/api/admin/config/route';
import * as googleAuthModule from '@/lib/calendars/google-auth';
import * as googleCalModule from '@/lib/calendars/google';
import { env } from '@/env';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';

describe('GET /api/slots', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    const db = getDb();
    db.delete(settings).run();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns 400 if parameters are missing', async () => {
    const req = new Request('http://localhost:8080/api/slots');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 if meeting type is invalid', async () => {
    const req = new Request('http://localhost:8080/api/slots?date=2026-10-12&type=invalid_type');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns 200 and a list of slots for valid parameters', async () => {
    const req = new Request('http://localhost:8080/api/slots?date=2027-10-12&type=intro');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.slots.length).toBeGreaterThan(0);
  });

  it('A1 - returns 503 if Google Calendar integration throws an error (Fail Closed)', async () => {
    vi.spyOn(googleAuthModule, 'getValidAccessToken').mockResolvedValue('fake-token');
    vi.spyOn(googleCalModule, 'fetchGoogleFreeBusy').mockRejectedValue(
      new Error('Google API Down'),
    );

    const req = new Request('http://localhost:8080/api/slots?date=2027-10-12&type=intro');
    const res = await GET(req);

    expect(res.status).toBe(503);
    const data = await res.json();
    expect(data.error).toContain('Unable to verify availability');
  });

  it('A1 - omits slots that overlap with Google Calendar busy blocks', async () => {
    vi.spyOn(googleAuthModule, 'getValidAccessToken').mockResolvedValue('fake-token');
    vi.spyOn(googleCalModule, 'fetchGoogleFreeBusy').mockResolvedValue([
      {
        start: new Date('2027-10-12T09:00:00Z'),
        end: new Date('2027-10-12T10:00:00Z'),
      },
    ]);

    const req = new Request('http://localhost:8080/api/slots?date=2027-10-12&type=intro');
    const res = await GET(req);
    const data = await res.json();

    const has9amSlot = data.slots.some((s: any) => s.startsAt === '2027-10-12T09:00:00.000Z');
    expect(has9amSlot).toBe(false); // The 9 AM slot should be removed
  });

  it('A8 - POST /api/admin/config changes output of /api/slots', async () => {
    const req1 = new Request('http://localhost:8080/api/slots?date=2027-10-12&type=intro');
    const res1 = await GET(req1);
    const data1 = await res1.json();
    expect(data1.slots.length).toBeGreaterThan(0);

    const postReq = new Request('http://localhost:8080/api/admin/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ minNoticeHours: 999 }), // Push configuration blocking anything less than 999 hours notice
    });
    await POST_CONFIG(postReq);

    const req2 = new Request('http://localhost:8080/api/slots?date=2027-10-12&type=intro');
    const res2 = await GET(req2);
    const data2 = await res2.json();
    expect(data2.slots.length).toBe(0); // Configuration applied immediately
  });
});
