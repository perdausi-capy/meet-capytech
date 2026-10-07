import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST } from '@/app/api/bookings/route';
import { getDb } from '@/lib/db';
import { bookings, settings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import * as slotsEngineModule from '@/lib/slots/engine';

describe('POST /api/bookings', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    resetRateLimitsForTests();

    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const validPayload = {
    meetingType: 'intro',
    date: '2027-10-14',
    startTime: '2027-10-14T09:00:00.000Z',
    name: 'Tester Person',
    email: 'tester@capytech.com',
    notes: 'Looking forward to it',
  };

  it('returns 400 for missing or invalid payloads', async () => {
    const req = new Request('http://localhost:8080/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ name: 'Short' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 409 Conflict if the requested slot is not available', async () => {
    const req = new Request('http://localhost:8080/api/bookings', {
      method: 'POST',
      body: JSON.stringify({
        ...validPayload,
        startTime: '2027-10-14T03:00:00.000Z',
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });

  it('returns 201 and saves to the database for a valid slot', async () => {
    const req = new Request('http://localhost:8080/api/bookings', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);

    const db = getDb();
    const dbRecord = db
      .select()
      .from(bookings)
      .where(eq(bookings.email, 'tester@capytech.com'))
      .get();

    expect(dbRecord).toBeDefined();
    expect(dbRecord?.email).toBe('tester@capytech.com');
    expect(dbRecord?.status).toBe('confirmed');
  });

  it('returns 429 when booking rate limits are exceeded', async () => {
    for (let i = 0; i < 3; i += 1) {
      const req = new Request('http://localhost:8080/api/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, email: 'limited@capytech.com' }),
      });
      await POST(req);
    }

    const finalReq = new Request('http://localhost:8080/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ ...validPayload, email: 'limited@capytech.com' }),
    });
    const finalRes = await POST(finalReq);

    expect(finalRes.status).toBe(429);
  });

  it('prevents overlapping reservations inside the immediate transaction', async () => {
    vi.spyOn(slotsEngineModule, 'getBookableSlots').mockResolvedValue([
      {
        startsAt: validPayload.startTime,
        endsAt: '2027-10-14T09:15:00.000Z',
      },
    ]);

    const db = getDb();
    db.insert(bookings)
      .values({
        id: 'existing-overlap',
        type_slug: 'intro',
        status: 'pending',
        starts_at: '2027-10-14T09:05:00.000Z',
        ends_at: '2027-10-14T09:20:00.000Z',
        name: 'Existing',
        email: 'existing@capytech.com',
        manage_token_hash: 'existing-hash',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .run();

    const req = new Request('http://localhost:8080/api/bookings', {
      method: 'POST',
      body: JSON.stringify({ ...validPayload, email: 'overlap@capytech.com' }),
    });
    const res = await POST(req);

    expect(res.status).toBe(409);
  });
});
