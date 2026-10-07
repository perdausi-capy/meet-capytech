import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET as GET_MANAGE } from '@/app/api/manage/[token]/route';
import { POST as CANCEL_BOOKING } from '@/app/api/manage/[token]/cancel/route';
import { POST as RESCHEDULE_BOOKING } from '@/app/api/manage/[token]/reschedule/route';
import { getDb } from '@/lib/db';
import { bookings, settings } from '@/lib/db/schema';
import { hashManageToken } from '@/lib/booking/manage';
import { eq } from 'drizzle-orm';

describe('M4 Guest Self-Service API', () => {
  const rawToken = 'test-manage-token-123';
  const tokenHash = hashManageToken(rawToken);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));

    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run(); // <--- FIX: Wipe settings to prevent test state leakage

    db.insert(bookings)
      .values({
        id: 'existing-booking-1',
        type_slug: 'intro',
        status: 'confirmed',
        starts_at: '2027-10-12T08:00:00.000Z',
        ends_at: '2027-10-12T08:15:00.000Z',
        name: 'Guest User',
        email: 'guest@capytech.com',
        manage_token_hash: tokenHash,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .run();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('A4 - returns 410 if attempting to act on a booking that is not confirmed', async () => {
    const db = getDb();
    db.update(bookings)
      .set({ status: 'cancelled' })
      .where(eq(bookings.id, 'existing-booking-1'))
      .run();

    const req = new Request(`http://localhost:8080/api/manage/${rawToken}/cancel`, {
      method: 'POST',
    });
    const res = await CANCEL_BOOKING(req, { params: Promise.resolve({ token: rawToken }) });
    expect(res.status).toBe(410);
  });

  it('A4 - POST /api/manage/[token]/reschedule books new slot and labels old slot as rescheduled', async () => {
    const req = new Request(`http://localhost:8080/api/manage/${rawToken}/reschedule`, {
      method: 'POST',
      body: JSON.stringify({ date: '2027-10-12', startTime: '2027-10-12T09:00:00.000Z' }),
    });

    const res = await RESCHEDULE_BOOKING(req, { params: Promise.resolve({ token: rawToken }) });
    expect(res.status).toBe(200);

    const db = getDb();
    const oldRecord = db.select().from(bookings).where(eq(bookings.id, 'existing-booking-1')).get();
    expect(oldRecord?.status).toBe('rescheduled');
  });
});
