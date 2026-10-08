import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST as POST_CONFIG } from '@/app/api/admin/config/route';
import { GET as GET_PUBLIC_CONFIG } from '@/app/api/config/route';
import { checkAndIncrementRateLimit, resetRateLimitsForTests } from '@/lib/security/rate-limit';
import { getAvailableSlots } from '@/lib/slots/engine';
import { DEFAULT_AVAILABILITY_CONFIG } from '@/lib/slots/config';
import { getDb } from '@/lib/db';
import { settings } from '@/lib/db/schema';
import { env } from '@/env';

function postConfig(body: unknown) {
  return POST_CONFIG(
    new Request('http://localhost:8080/api/admin/config', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

describe('Admin config validation', () => {
  beforeEach(() => {
    getDb().delete(settings).run();
  });

  it.each([
    [{ slotIntervalMinutes: 0 }],
    [{ slotIntervalMinutes: -15 }],
    [{ maxAdvanceDays: 0 }],
    [{ timezone: 'Mars/Olympus' }],
    [{ workingHours: { monday: [{ start: '17:00', end: '09:00' }] } }],
    [{ workingHours: { monday: [{ start: '9am', end: '5pm' }] } }],
    [{ meetingTypes: {} }],
    [{ unknownField: true }],
  ])('rejects %j', async (body) => {
    const res = await postConfig(body);
    expect(res.status).toBe(400);
  });

  it('merges partial working hours instead of wiping the other days', async () => {
    const res = await postConfig({
      workingHours: { saturday: [{ start: '10:00', end: '12:00' }] },
    });
    expect(res.status).toBe(200);
    const { config } = await res.json();
    expect(config.workingHours.saturday).toEqual([{ start: '10:00', end: '12:00' }]);
    expect(config.workingHours.monday).toEqual(DEFAULT_AVAILABILITY_CONFIG.workingHours.monday);
  });

  it('the slot engine refuses a non-positive interval instead of looping forever', () => {
    const slots = getAvailableSlots({
      dateStr: '2027-10-12',
      meetingType: DEFAULT_AVAILABILITY_CONFIG.meetingTypes.intro!,
      busyRanges: [],
      now: new Date('2027-10-01T00:00:00Z'),
      config: { ...DEFAULT_AVAILABILITY_CONFIG, slotIntervalMinutes: 0 },
    });
    expect(slots).toEqual([]);
  });

  it('public config exposes meeting types and working weekdays from the stored config', async () => {
    await postConfig({ workingHours: { friday: [] } });
    const res = await GET_PUBLIC_CONFIG(new Request('http://localhost:8080/api/config'));
    const data = await res.json();
    expect(data.meetingTypes.map((t: { slug: string }) => t.slug)).toEqual(['intro', 'tech']);
    expect(data.workingWeekdays).toEqual([1, 2, 3, 4]);
    expect(data.timezone).toBe('Europe/London');
    expect(data.turnstileSiteKey).toBeNull();
  });
});

describe('Rate limit scopes', () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetRateLimitsForTests();
  });

  const req = () =>
    new Request('http://localhost:8080/', { headers: { 'cf-connecting-ip': '1.2.3.4' } });

  it('browsing availability does not use up the booking budget', () => {
    for (let i = 0; i < 30; i++) {
      expect(checkAndIncrementRateLimit(req(), undefined, 'read').allowed).toBe(true);
    }
    expect(checkAndIncrementRateLimit(req(), 'guest@example.com', 'write').allowed).toBe(true);
  });

  it('still caps writes per IP', () => {
    for (let i = 0; i < 10; i++) checkAndIncrementRateLimit(req());
    expect(checkAndIncrementRateLimit(req()).allowed).toBe(false);
  });
});
