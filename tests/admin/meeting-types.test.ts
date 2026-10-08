import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { availability_overrides, bookings, meeting_types, settings } from '@/lib/db/schema';
import { resetMeetingTypeSeedForTests } from '@/lib/meeting-types';
import { GET as LIST, POST as CREATE } from '@/app/api/admin/meeting-types/route';
import {
  DELETE as REMOVE,
  PATCH as SET_STATUS,
  PUT as UPDATE,
} from '@/app/api/admin/meeting-types/[id]/route';
import { GET as PUBLIC_CONFIG } from '@/app/api/config/route';
import { GET as AVAILABILITY } from '@/app/api/availability/route';
import { POST as BOOK } from '@/app/api/bookings/route';
import { upsertOverride } from '@/lib/availability-overrides';
import { saveAvailabilityRules, getAvailabilityConfig } from '@/lib/slots/config';
import { resetRateLimitsForTests } from '@/lib/security/rate-limit';
import * as bankHolidayModule from '@/lib/calendars/bank-holidays';
import { env } from '@/env';

// No session cookie in these tests (requests without a Bearer token are anonymous).
vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

const auth = { Authorization: `Bearer ${env.ADMIN_TOKEN}`, 'Content-Type': 'application/json' };
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

const demo = {
  slug: 'demo',
  name: 'Product demo',
  description: 'A walkthrough.',
  durationMinutes: 60,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  locationKind: 'phone' as const,
  locationDetail: '+44 20 7946 0000',
  maxPerDay: null,
  isPrivate: false,
};

async function create(body: object) {
  const res = await CREATE(
    new Request('http://localhost/api/admin/meeting-types', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function list() {
  const res = await LIST(
    new Request('http://localhost/api/admin/meeting-types', { headers: auth }),
  );
  return (await res.json()).meetingTypes as Array<{ id: string; slug: string; status: string }>;
}

function addBooking(slug: string, startsAt: string, minutes = 15, id = `b-${startsAt}`) {
  getDb()
    .insert(bookings)
    .values({
      id,
      type_slug: slug,
      status: 'confirmed',
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + minutes * 60_000).toISOString(),
      name: 'Guest',
      email: 'g@example.com',
      manage_token_hash: `h-${id}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .run();
}

describe('Admin meeting types', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    vi.spyOn(bankHolidayModule, 'getUkBankHolidays').mockResolvedValue(new Set());
    resetRateLimitsForTests();
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
    db.delete(meeting_types).run();
    db.delete(availability_overrides).run();
    resetMeetingTypeSeedForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Test files share one database: leave no overrides, archived types or caps behind.
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
    db.delete(meeting_types).run();
    db.delete(availability_overrides).run();
    resetMeetingTypeSeedForTests();
  });

  it('seeds the original two types the first time', async () => {
    expect((await list()).map((t) => t.slug)).toEqual(['intro', 'tech']);
  });

  it('requires the admin token', async () => {
    const res = await LIST(new Request('http://localhost/api/admin/meeting-types'));
    expect(res.status).toBe(401);
  });

  it('creates a type that shows up publicly with its own location', async () => {
    const { status } = await create(demo);
    expect(status).toBe(201);
    const pub = await (await PUBLIC_CONFIG(new Request('http://localhost/api/config'))).json();
    const shown = pub.meetingTypes.find((t: { slug: string }) => t.slug === 'demo');
    expect(shown).toMatchObject({
      durationMinutes: 60,
      location: 'Phone call',
      locationKind: 'phone',
    });
  });

  it('validates input and rejects duplicate link names', async () => {
    expect((await create({ ...demo, slug: 'Has Spaces' })).status).toBe(400);
    expect(
      (await create({ ...demo, locationKind: 'in_person', locationDetail: null })).status,
    ).toBe(400);
    expect((await create({ ...demo, slug: 'intro' })).status).toBe(409);
  });

  it('keeps private types out of the public list unless their link is used', async () => {
    await create({ ...demo, isPrivate: true });
    const plain = await (await PUBLIC_CONFIG(new Request('http://localhost/api/config'))).json();
    expect(plain.meetingTypes.map((t: { slug: string }) => t.slug)).not.toContain('demo');
    const linked = await (
      await PUBLIC_CONFIG(new Request('http://localhost/api/config?type=demo'))
    ).json();
    expect(linked.meetingTypes.map((t: { slug: string }) => t.slug)).toContain('demo');
  });

  it('locks the link name once booked, and archives instead of deleting', async () => {
    const intro = (await list()).find((t) => t.slug === 'intro')!;
    addBooking('intro', '2027-10-12T09:00:00.000Z');

    const rename = await UPDATE(
      new Request('http://localhost', {
        method: 'PUT',
        headers: auth,
        body: JSON.stringify({
          ...demo,
          slug: 'intro-call',
          locationKind: 'google_meet',
          locationDetail: null,
        }),
      }),
      ctx(intro.id),
    );
    expect(rename.status).toBe(409);

    const del = await REMOVE(
      new Request('http://localhost', { method: 'DELETE', headers: auth }),
      ctx(intro.id),
    );
    expect(del.status).toBe(409);

    const archive = await SET_STATUS(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ status: 'archived' }),
      }),
      ctx(intro.id),
    );
    expect(archive.status).toBe(200);
    expect(getAvailabilityConfig().meetingTypes.intro).toBeUndefined(); // no longer bookable
  });

  it('deletes a never-booked type but never the last active one', async () => {
    const { body } = await create(demo);
    const del = await REMOVE(
      new Request('http://localhost', { method: 'DELETE', headers: auth }),
      ctx(body.meetingType.id),
    );
    expect(del.status).toBe(200);

    const [intro, tech] = await list();
    await SET_STATUS(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ status: 'archived' }),
      }),
      ctx(tech!.id),
    );
    const last = await SET_STATUS(
      new Request('http://localhost', {
        method: 'PATCH',
        headers: auth,
        body: JSON.stringify({ status: 'archived' }),
      }),
      ctx(intro!.id),
    );
    expect(last.status).toBe(400);
  });
});

describe('Daily limits and date overrides', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2027-10-01T00:00:00Z'));
    vi.spyOn(bankHolidayModule, 'getUkBankHolidays').mockResolvedValue(new Set());
    resetRateLimitsForTests();
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
    db.delete(meeting_types).run();
    db.delete(availability_overrides).run();
    resetMeetingTypeSeedForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    // Test files share one database: leave no overrides, archived types or caps behind.
    const db = getDb();
    db.delete(bookings).run();
    db.delete(settings).run();
    db.delete(meeting_types).run();
    db.delete(availability_overrides).run();
    resetMeetingTypeSeedForTests();
  });

  const month = async (tz = 'Europe/London') => {
    const res = await AVAILABILITY(
      new Request(`http://localhost/api/availability?type=intro&month=2027-10&tz=${tz}`),
    );
    return (await res.json()).days as Record<string, unknown[]>;
  };

  it('removes a day once it reaches the daily cap', async () => {
    const { meetingTypes: _t, ...rules } = getAvailabilityConfig();
    void _t;
    saveAvailabilityRules({ ...rules, maxMeetingsPerDay: 2 });
    addBooking('intro', '2027-10-12T08:00:00.000Z');
    expect((await month())['2027-10-12']).toBeDefined();
    addBooking('tech', '2027-10-12T12:00:00.000Z', 30);
    expect((await month())['2027-10-12']).toBeUndefined();
    expect((await month())['2027-10-13']).toBeDefined();
  });

  it('enforces the cap inside the reservation, even if the slot list was stale', async () => {
    const { meetingTypes: _t, ...rules } = getAvailabilityConfig();
    void _t;
    saveAvailabilityRules({ ...rules, maxMeetingsPerDay: 1 });
    const book = (startTime: string, email: string) =>
      BOOK(
        new Request('http://localhost/api/bookings', {
          method: 'POST',
          headers: { 'cf-connecting-ip': email },
          body: JSON.stringify({ meetingType: 'intro', startTime, name: 'Guest', email }),
        }),
      );
    expect((await book('2027-10-12T08:00:00.000Z', 'a@example.com')).status).toBe(201);
    const second = await book('2027-10-12T13:00:00.000Z', 'b@example.com');
    expect(second.status).toBe(409);
  });

  it('applies closed and custom-hours overrides', async () => {
    upsertOverride({ date: '2027-10-12', kind: 'closed', windows: [] });
    upsertOverride({
      date: '2027-10-16',
      kind: 'custom',
      windows: [{ start: '10:00', end: '11:00' }],
    }); // a Saturday
    const days = await month();
    expect(days['2027-10-12']).toBeUndefined();
    expect(days['2027-10-16']).toHaveLength(4); // 10:00, 10:15, 10:30, 10:45
  });
});
