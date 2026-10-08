import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { GET as ACTIVITY } from '@/app/api/admin/activity/route';
import { env } from '@/env';

vi.mock('next/headers', () => ({ cookies: () => ({ get: () => undefined }) }));

const auth = { Authorization: `Bearer ${env.ADMIN_TOKEN}` };

function add(
  id: string,
  startsAt: string,
  status: 'confirmed' | 'cancelled' | 'rescheduled',
  type = 'intro',
) {
  getDb()
    .insert(bookings)
    .values({
      id,
      type_slug: type,
      status,
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + 15 * 60_000).toISOString(),
      name: 'G',
      email: 'g@example.com',
      manage_token_hash: `h-${id}`,
      created_at: '2027-09-01T00:00:00.000Z',
      updated_at: '2027-09-01T00:00:00.000Z',
    })
    .run();
}

const get = async (q: string) => {
  const res = await ACTIVITY(
    new Request(`http://localhost/api/admin/activity?${q}`, { headers: auth }),
  );
  return { status: res.status, body: await res.json() };
};

describe('GET /api/admin/activity', () => {
  beforeEach(() => {
    getDb().delete(bookings).run();
    add('a', '2027-10-12T08:00:00.000Z', 'confirmed'); // 09:00 London
    add('b', '2027-10-12T08:30:00.000Z', 'cancelled');
    add('c', '2027-10-20T13:00:00.000Z', 'confirmed', 'tech');
    add('d', '2027-10-31T23:30:00.000Z', 'confirmed'); // 31 Oct 23:30 London (GMT)
    add('e', '2027-11-02T10:00:00.000Z', 'rescheduled');
  });
  afterEach(() => {
    getDb().delete(bookings).run();
  });

  it('buckets a month by host-calendar day with status totals and a type breakdown', async () => {
    const { body } = await get('view=month&date=2027-10-15');
    expect(body.buckets).toHaveLength(31);
    expect(body.buckets[11]).toMatchObject({ confirmed: 1, cancelled: 1, rescheduled: 0 });
    expect(body.buckets[30].confirmed).toBe(1);
    expect(body.totals).toEqual({ confirmed: 3, cancelled: 1, rescheduled: 0 });
    expect(body.byType).toEqual([
      { slug: 'intro', name: 'Introductory Call', count: 2 },
      { slug: 'tech', name: 'Technical Consultation', count: 1 },
    ]);
  });

  it('buckets a day by hour in the host time zone, and a year by month', async () => {
    const day = (await get('view=day&date=2027-10-12')).body;
    expect(day.buckets).toHaveLength(24);
    expect(day.buckets[9]).toMatchObject({ confirmed: 1, cancelled: 1 }); // 09:00 and 09:30 BST
    const year = (await get('view=year&date=2027-03-01')).body;
    expect(year.buckets[9].confirmed).toBe(3);
    expect(year.buckets[10].rescheduled).toBe(1);
  });

  it('validates input and requires the admin token', async () => {
    expect((await get('view=week&date=2027-10-15')).status).toBe(400);
    const res = await ACTIVITY(
      new Request('http://localhost/api/admin/activity?view=day&date=2027-10-15'),
    );
    expect(res.status).toBe(401);
  });
});
