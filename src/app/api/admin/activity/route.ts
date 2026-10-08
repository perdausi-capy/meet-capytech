import { NextResponse } from 'next/server';
import { and, gte, inArray, lt } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { z } from 'zod';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getDb } from '@/lib/db';
import { bookings } from '@/lib/db/schema';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getMeetingTypeBySlug } from '@/lib/meeting-types';

export const dynamic = 'force-dynamic';

const querySchema = z.object({
  view: z.enum(['day', 'month', 'year']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type Status = 'confirmed' | 'rescheduled' | 'cancelled';

/**
 * Meetings by start time for one day (per hour), month (per day) or year (per month), in the
 * host's time zone, split by status, plus totals and a per-meeting-type breakdown.
 */
export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    view: searchParams.get('view'),
    date: searchParams.get('date'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });

  const { view, date } = parsed.data;
  const tz = getAvailabilityConfig().timezone;
  const anchor = DateTime.fromISO(date, { zone: tz });
  if (!anchor.isValid) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const unit = view === 'day' ? 'day' : view === 'month' ? 'month' : 'year';
  const start = anchor.startOf(unit);
  const end = start.plus({ [`${unit}s`]: 1 });

  const rows = getDb()
    .select({
      starts_at: bookings.starts_at,
      status: bookings.status,
      type_slug: bookings.type_slug,
    })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['confirmed', 'rescheduled', 'cancelled']),
        gte(bookings.starts_at, start.toUTC().toISO()!),
        lt(bookings.starts_at, end.toUTC().toISO()!),
      ),
    )
    .all();

  // Buckets: hours of the day, days of the month, or months of the year.
  const count = view === 'day' ? 24 : view === 'month' ? start.daysInMonth! : 12;
  const buckets = Array.from({ length: count }, (_, i) => {
    const at =
      view === 'day'
        ? start.plus({ hours: i })
        : view === 'month'
          ? start.plus({ days: i })
          : start.plus({ months: i });
    return {
      key: i,
      label:
        view === 'day'
          ? at.toFormat('ha').toLowerCase()
          : view === 'month'
            ? at.toFormat('d LLL')
            : at.toFormat('LLL'),
      confirmed: 0,
      rescheduled: 0,
      cancelled: 0,
    };
  });

  const totals: Record<Status, number> = { confirmed: 0, rescheduled: 0, cancelled: 0 };
  const byType = new Map<string, number>();
  for (const r of rows) {
    const t = DateTime.fromISO(r.starts_at, { zone: tz });
    const i = view === 'day' ? t.hour : view === 'month' ? t.day - 1 : t.month - 1;
    const status = r.status as Status;
    buckets[i]![status] += 1;
    totals[status] += 1;
    if (status !== 'cancelled' && status !== 'rescheduled') {
      byType.set(r.type_slug, (byType.get(r.type_slug) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    view,
    timezone: tz,
    start: start.toISODate(),
    title:
      view === 'day'
        ? start.toFormat('cccc d LLLL yyyy')
        : view === 'month'
          ? start.toFormat('LLLL yyyy')
          : start.toFormat('yyyy'),
    buckets,
    totals,
    byType: [...byType.entries()]
      .map(([slug, n]) => ({
        slug,
        name: getMeetingTypeBySlug(slug, { includeArchived: true })?.name ?? slug,
        count: n,
      }))
      .sort((a, b) => b.count - a.count),
  });
}
