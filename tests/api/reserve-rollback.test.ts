import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/bookings/route';
import { getDb } from '@/lib/db';
import { bookings, settings } from '@/lib/db/schema';
import * as googleEventModule from '@/lib/booking/google-event';
import * as slotsEngineModule from '@/lib/slots/engine';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import { eq } from 'drizzle-orm';

describe('Reserve-then-confirm and Rollback on Google failure', () => {
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
    date: '2027-10-12',
    startTime: '2027-10-12T11:00:00.000Z',
    name: 'Rollback Tester',
    email: 'rollback@capytech.com',
    notes: 'Testing Google error handling',
  };

  it('rolls back database reservation if Google Calendar event creation fails', async () => {
    vi.spyOn(slotsEngineModule, 'getBookableSlots').mockResolvedValue([
      {
        startsAt: validPayload.startTime,
        endsAt: '2027-10-12T11:15:00.000Z',
      },
    ]);
    vi.spyOn(googleEventModule, 'createGoogleCalendarEvent').mockRejectedValue(
      new Error('Simulated Google Calendar API Error'),
    );

    const req = new Request('http://localhost:8080/api/bookings', {
      method: 'POST',
      body: JSON.stringify(validPayload),
    });

    const res = await POST(req);
    expect(res.status).toBe(502);

    const data = await res.json();
    expect(data.error).toContain('rolled back');

    const db = getDb();
    const dbRecord = db
      .select()
      .from(bookings)
      .where(eq(bookings.email, 'rollback@capytech.com'))
      .get();

    expect(dbRecord).toBeUndefined();
  });
});
