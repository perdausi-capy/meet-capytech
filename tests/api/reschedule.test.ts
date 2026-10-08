import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { POST as RESCHEDULE_BOOKING } from '@/app/api/manage/[token]/reschedule/route';
import { getDb } from '@/lib/db';
import { bookings, settings } from '@/lib/db/schema';
import { hashManageToken } from '@/lib/booking/manage';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import * as googleEventModule from '@/lib/booking/google-event';
import { eq } from 'drizzle-orm';

const rawToken = 'reschedule-token-abc';
const ORIGINAL_ID = 'original-booking';
const NEW_START = '2027-10-12T09:00:00.000Z';

function reschedule() {
  const req = new Request(`http://localhost:8080/api/manage/${rawToken}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ startTime: NEW_START }),
  });
  return RESCHEDULE_BOOKING(req, { params: Promise.resolve({ token: rawToken }) });
}

describe('Reschedule safety (reserve new slot first, never lose the original)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    resetRateLimitsForTests();

    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
    db.insert(bookings)
      .values({
        id: ORIGINAL_ID,
        type_slug: 'intro',
        status: 'confirmed',
        starts_at: '2027-10-12T13:00:00.000Z',
        ends_at: '2027-10-12T13:15:00.000Z',
        name: 'Guest User',
        email: 'guest@capytech.com',
        event_id: 'google-original-event',
        manage_token_hash: hashManageToken(rawToken),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .run();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const original = () => getDb().select().from(bookings).where(eq(bookings.id, ORIGINAL_ID)).get();
  const others = () =>
    getDb()
      .select()
      .from(bookings)
      .all()
      .filter((b) => b.id !== ORIGINAL_ID);

  it('moves the booking, returns a new manage token and removes the old event', async () => {
    vi.spyOn(googleEventModule, 'createGoogleCalendarEvent').mockResolvedValue({
      eventId: 'google-new-event',
    });
    const deleteSpy = vi
      .spyOn(googleEventModule, 'deleteGoogleCalendarEvent')
      .mockResolvedValue(true);

    const res = await reschedule();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.manageToken).toBeTruthy();
    expect(data.warning).toBeUndefined();

    expect(original()?.status).toBe('rescheduled');
    const [moved] = others();
    expect(moved?.status).toBe('confirmed');
    expect(moved?.starts_at).toBe(NEW_START);
    expect(moved?.event_id).toBe('google-new-event');
    expect(original()?.rescheduled_to).toBe(moved?.id);
    expect(deleteSpy).toHaveBeenCalledWith('google-original-event');
  });

  it('keeps the original booking and event untouched when the new event cannot be created', async () => {
    vi.spyOn(googleEventModule, 'createGoogleCalendarEvent').mockRejectedValue(
      new Error('Google down'),
    );
    const deleteSpy = vi.spyOn(googleEventModule, 'deleteGoogleCalendarEvent');

    const res = await reschedule();
    expect(res.status).toBe(502);

    expect(original()?.status).toBe('confirmed');
    expect(others()).toHaveLength(0); // reservation released
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('holds the new slot while the calendar event is being created', async () => {
    let pendingDuringCreate: string | undefined;
    vi.spyOn(googleEventModule, 'createGoogleCalendarEvent').mockImplementation(async () => {
      pendingDuringCreate = others()[0]?.status;
      return { eventId: 'google-new-event' };
    });
    vi.spyOn(googleEventModule, 'deleteGoogleCalendarEvent').mockResolvedValue(true);

    await reschedule();
    expect(pendingDuringCreate).toBe('pending');
  });

  it('reports (instead of hiding) an old event that could not be removed', async () => {
    vi.spyOn(googleEventModule, 'createGoogleCalendarEvent').mockResolvedValue({
      eventId: 'google-new-event',
    });
    const deleteSpy = vi
      .spyOn(googleEventModule, 'deleteGoogleCalendarEvent')
      .mockRejectedValue(new Error('Google down'));

    const res = await reschedule();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.warning).toMatch(/old calendar invite/);
    expect(deleteSpy).toHaveBeenCalledTimes(3); // retried
    expect(original()?.status).toBe('rescheduled');
  });
});
