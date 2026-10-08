import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { GET } from '@/app/api/availability/route';
import { getDb } from '@/lib/db';
import { bookings, settings } from '@/lib/db/schema';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import * as googleAuthModule from '@/lib/calendars/google-auth';
import * as googleCalModule from '@/lib/calendars/google';
import * as bankHolidayModule from '@/lib/calendars/bank-holidays';

async function availability(query: string) {
  const res = await GET(new Request(`http://localhost:8080/api/availability?${query}`));
  return { status: res.status, body: await res.json() };
}

describe('GET /api/availability (month view)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z')); // a Friday
    resetRateLimitsForTests();
    vi.spyOn(bankHolidayModule, 'getUkBankHolidays').mockResolvedValue(new Set());
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('lists only days with slots, keyed by the guest’s local date', async () => {
    const { status, body } = await availability('type=intro&month=2027-10&tz=Europe/London');
    expect(status).toBe(200);
    const days = Object.keys(body.days);
    expect(days).toContain('2027-10-04'); // Monday
    expect(days).not.toContain('2027-10-09'); // Saturday
    expect(days).not.toContain('2027-10-10'); // Sunday
    expect(days).not.toContain('2027-10-01'); // inside the 24h minimum notice
    expect(days.every((d) => d.startsWith('2027-10'))).toBe(true);
  });

  it('shifts days for a guest far from London (Auckland Saturday gets London Friday afternoon)', async () => {
    const { body } = await availability('type=intro&month=2027-10&tz=Pacific/Auckland');
    const saturday = body.days['2027-10-09'];
    expect(saturday?.length).toBeGreaterThan(0);
    // Every slot listed under a date really falls on that date in Auckland.
    for (const [date, slots] of Object.entries(body.days) as [string, { startsAt: string }[]][]) {
      for (const s of slots) {
        const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(
          new Date(s.startsAt),
        );
        expect(local).toBe(date);
      }
    }
  });

  it('removes booked and calendar-busy times', async () => {
    getDb()
      .insert(bookings)
      .values({
        id: 'b1',
        type_slug: 'intro',
        status: 'confirmed',
        starts_at: '2027-10-04T08:00:00.000Z',
        ends_at: '2027-10-04T08:15:00.000Z',
        name: 'A',
        email: 'a@example.com',
        manage_token_hash: 'h1',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .run();
    vi.spyOn(googleAuthModule, 'getValidAccessToken').mockResolvedValue('token');
    const freeBusy = vi
      .spyOn(googleCalModule, 'fetchGoogleFreeBusy')
      .mockResolvedValue([
        { start: new Date('2027-10-05T00:00:00Z'), end: new Date('2027-10-06T00:00:00Z') },
      ]);

    const { body } = await availability('type=intro&month=2027-10&tz=Europe/London');
    const starts = (body.days['2027-10-04'] as { startsAt: string }[]).map((s) => s.startsAt);
    expect(starts).not.toContain('2027-10-04T08:00:00.000Z');
    expect(body.days['2027-10-05']).toBeUndefined(); // whole day busy on Google
    expect(freeBusy).toHaveBeenCalledTimes(1); // one calendar read for the whole month
  });

  it('fails closed when a calendar cannot be read', async () => {
    vi.spyOn(googleAuthModule, 'getValidAccessToken').mockResolvedValue('token');
    vi.spyOn(googleCalModule, 'fetchGoogleFreeBusy').mockRejectedValue(new Error('down'));
    const { status } = await availability('type=intro&month=2027-10');
    expect(status).toBe(503);
  });

  it('returns nothing for months outside the booking window without reading calendars', async () => {
    const freeBusy = vi.spyOn(googleCalModule, 'fetchGoogleFreeBusy');
    const { status, body } = await availability('type=intro&month=2028-06');
    expect(status).toBe(200);
    expect(body.days).toEqual({});
    expect(freeBusy).not.toHaveBeenCalled();
  });

  it('validates parameters', async () => {
    expect((await availability('type=intro&month=2027-13')).status).toBe(400);
    expect((await availability('type=nope&month=2027-10')).status).toBe(400);
    expect((await availability('type=intro&month=2027-10&tz=Mars/Base')).status).toBe(400);
  });
});
