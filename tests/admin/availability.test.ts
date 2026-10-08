import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { availability_overrides, settings } from '@/lib/db/schema';
import { GET as GET_AV, PUT as PUT_AV } from '@/app/api/admin/availability/route';
import { POST as ADD_OVERRIDE } from '@/app/api/admin/availability/overrides/route';
import { DELETE as DELETE_OVERRIDE } from '@/app/api/admin/availability/overrides/[date]/route';
import { GET as AVAILABILITY } from '@/app/api/availability/route';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import { env } from '@/env';

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

const auth = { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
const weekday = [{ start: '09:00', end: '17:00' }];
const rules = {
  timezone: 'Europe/London',
  minNoticeHours: 24,
  maxAdvanceDays: 60,
  slotIntervalMinutes: 30,
  maxMeetingsPerDay: 4,
  workingHours: {
    monday: weekday,
    tuesday: [
      { start: '09:00', end: '12:00' },
      { start: '14:00', end: '17:00' },
    ],
    wednesday: weekday,
    thursday: weekday,
    friday: weekday,
    saturday: [],
    sunday: [],
  },
};

const put = (body: unknown) =>
  PUT_AV(
    new Request('http://localhost/api/admin/availability', {
      method: 'PUT',
      headers: auth,
      body: JSON.stringify(body),
    }),
  );
const addOverride = (body: unknown) =>
  ADD_OVERRIDE(
    new Request('http://localhost/api/admin/availability/overrides', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(body),
    }),
  );
const month = async () =>
  (
    await (
      await AVAILABILITY(
        new Request('http://localhost/api/availability?type=intro&month=2027-10&tz=Europe/London'),
      )
    ).json()
  ).days as Record<string, { startsAt: string }[]>;

describe('Admin availability', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    resetRateLimitsForTests();
    getDb().delete(settings).run();
    getDb().delete(availability_overrides).run();
  });
  afterEach(() => {
    vi.useRealTimers();
    getDb().delete(settings).run();
    getDb().delete(availability_overrides).run();
  });

  it('saves the full rule set and the engine follows it (split shifts, 30-minute steps)', async () => {
    expect((await put(rules)).status).toBe(200);
    const got = await (await GET_AV(new Request('http://localhost', { headers: auth }))).json();
    expect(got.rules).toMatchObject({ slotIntervalMinutes: 30, maxMeetingsPerDay: 4 });

    const tuesday = (await month())['2027-10-12']!.map((s) => s.startsAt.slice(11, 16));
    expect(tuesday).toContain('08:00'); // 09:00 BST
    expect(tuesday).not.toContain('11:30'); // 12:30 BST, in the lunch gap
    expect(tuesday).toContain('13:00'); // 14:00 BST
    expect(tuesday.every((t) => t.endsWith(':00') || t.endsWith(':30'))).toBe(true);
  });

  it('rejects overlapping ranges and bad values', async () => {
    const overlapping = {
      ...rules,
      workingHours: {
        ...rules.workingHours,
        monday: [
          { start: '09:00', end: '13:00' },
          { start: '12:00', end: '17:00' },
        ],
      },
    };
    expect((await put(overlapping)).status).toBe(400);
    expect((await put({ ...rules, slotIntervalMinutes: 0 })).status).toBe(400);
    expect((await put({ ...rules, timezone: 'Nowhere/Land' })).status).toBe(400);
  });

  it('closes a whole date range and reopens a single day', async () => {
    const res = await addOverride({
      from: '2027-10-11',
      to: '2027-10-15',
      kind: 'closed',
      windows: [],
      note: 'Holiday',
    });
    expect((await res.json()).saved).toBe(5);
    let days = await month();
    for (const d of ['11', '12', '13', '14', '15']) expect(days[`2027-10-${d}`]).toBeUndefined();

    await DELETE_OVERRIDE(new Request('http://localhost', { method: 'DELETE', headers: auth }), {
      params: Promise.resolve({ date: '2027-10-13' }),
    });
    days = await month();
    expect(days['2027-10-13']).toBeDefined();
    expect(days['2027-10-14']).toBeUndefined();

    const listed = await (await GET_AV(new Request('http://localhost', { headers: auth }))).json();
    expect(listed.overrides.map((o: { date: string }) => o.date)).toEqual([
      '2027-10-11',
      '2027-10-12',
      '2027-10-14',
      '2027-10-15',
    ]);
  });

  it('validates override input', async () => {
    expect(
      (
        await addOverride({
          from: '2027-10-15',
          to: '2027-10-11',
          kind: 'closed',
          windows: [],
          note: null,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await addOverride({
          from: '2027-10-11',
          to: '2027-10-11',
          kind: 'custom',
          windows: [],
          note: null,
        })
      ).status,
    ).toBe(400);
  });
});
