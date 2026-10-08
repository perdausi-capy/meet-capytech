import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import { verifyAdminBearerToken } from '@/lib/security/auth';
import { getDb } from '@/lib/db';
import { bookings, google_tokens, jobs } from '@/lib/db/schema';
import { getAvailabilityConfig } from '@/lib/slots/config';
import { getMeetingTypeBySlug } from '@/lib/meeting-types';
import { getEmailMode } from '@/lib/email/send';
import { isTurnstileEnabled } from '@/lib/security/turnstile';
import { freeBusyStatusStore } from '@/lib/calendars/status-tracker';
import { backupDir } from '@/lib/backup';

export const dynamic = 'force-dynamic';

function lastBackupAt(): string | null {
  try {
    const files = fs
      .readdirSync(backupDir())
      .filter((f) => /^booking-\d{4}-\d{2}-\d{2}\.db$/.test(f));
    if (!files.length) return null;
    const latest = files.sort().at(-1)!;
    return fs.statSync(`${backupDir()}/${latest}`).mtime.toISOString();
  } catch {
    return null;
  }
}

/** Everything the admin overview needs in one request. */
export async function GET(request: Request) {
  if (!(await verifyAdminBearerToken(request))) {
    return NextResponse.json({ error: 'Unauthorized. Bearer token required.' }, { status: 401 });
  }

  const db = getDb();
  const config = getAvailabilityConfig();
  const now = DateTime.now().setZone(config.timezone);
  const nowIso = now.toUTC().toISO()!;
  const weekAhead = now.plus({ days: 7 }).toUTC().toISO()!;
  const monthStart = now.startOf('month').toUTC().toISO()!;
  const monthEnd = now.endOf('month').toUTC().toISO()!;
  const thirtyAgo = now.minus({ days: 30 }).toUTC().toISO()!;

  const count = (where: ReturnType<typeof and>) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(where)
      .get()?.n ?? 0;

  const typeName = (slug: string) =>
    getMeetingTypeBySlug(slug, { includeArchived: true })?.name ?? slug;

  const todayStart = now.startOf('day').toUTC().toISO()!;
  const todayEnd = now.endOf('day').toUTC().toISO()!;
  const today = db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'confirmed'),
        gte(bookings.starts_at, todayStart),
        lt(bookings.starts_at, todayEnd),
      ),
    )
    .orderBy(asc(bookings.starts_at))
    .all()
    .map((b) => ({
      id: b.id,
      name: b.name,
      email: b.email,
      company: b.company,
      typeName: typeName(b.type_slug),
      startsAt: b.starts_at,
      endsAt: b.ends_at,
    }));

  const upcoming = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.status, 'confirmed'), gte(bookings.starts_at, nowIso)))
    .orderBy(asc(bookings.starts_at))
    .limit(8)
    .all()
    .map((b) => ({
      id: b.id,
      name: b.name,
      email: b.email,
      company: b.company,
      typeName: typeName(b.type_slug),
      startsAt: b.starts_at,
      endsAt: b.ends_at,
    }));

  const recent = db
    .select()
    .from(bookings)
    .where(inArray(bookings.status, ['confirmed', 'cancelled', 'rescheduled']))
    .orderBy(desc(bookings.updated_at))
    .limit(8)
    .all()
    .map((b) => ({
      id: b.id,
      name: b.name,
      typeName: typeName(b.type_slug),
      status: b.status,
      startsAt: b.starts_at,
      updatedAt: b.updated_at,
    }));

  // Bookings created per week, last 12 weeks (oldest first).
  const weeks = Array.from({ length: 12 }, (_, i) => now.startOf('week').minus({ weeks: 11 - i }));
  const created = db
    .select({ created_at: bookings.created_at, status: bookings.status })
    .from(bookings)
    .where(gte(bookings.created_at, weeks[0]!.toUTC().toISO()!))
    .all();
  const activity = weeks.map((start) => {
    const end = start.plus({ weeks: 1 });
    const inWeek = created.filter((c) => {
      const t = DateTime.fromISO(c.created_at);
      return t >= start && t < end;
    });
    return {
      week: start.toISODate(),
      booked: inWeek.length,
      cancelled: inWeek.filter((c) => c.status === 'cancelled').length,
    };
  });

  const token = db.select().from(google_tokens).get();
  const failedJobs =
    db
      .select({ n: sql<number>`count(*)` })
      .from(jobs)
      .where(eq(jobs.status, 'failed'))
      .get()?.n ?? 0;

  const lastMonthStart = now.minus({ months: 1 }).startOf('month').toUTC().toISO()!;
  const sixtyAgo = now.minus({ days: 60 }).toUTC().toISO()!;
  const madeSince = (from: string, to: string) =>
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(and(gte(bookings.created_at, from), lt(bookings.created_at, to)))
      .get()?.n ?? 0;

  return NextResponse.json({
    timezone: config.timezone,
    today,
    stats: {
      today: today.length,
      lastMonth: count(
        and(
          inArray(bookings.status, ['confirmed', 'rescheduled']),
          gte(bookings.starts_at, lastMonthStart),
          lt(bookings.starts_at, monthStart),
        ),
      ),
      madeLast30: madeSince(thirtyAgo, nowIso),
      madePrevious30: madeSince(sixtyAgo, thirtyAgo),
      nextSevenDays: count(
        and(
          eq(bookings.status, 'confirmed'),
          gte(bookings.starts_at, nowIso),
          lt(bookings.starts_at, weekAhead),
        ),
      ),
      thisMonth: count(
        and(
          eq(bookings.status, 'confirmed'),
          gte(bookings.starts_at, monthStart),
          lt(bookings.starts_at, monthEnd),
        ),
      ),
      cancelledLast30: count(
        and(eq(bookings.status, 'cancelled'), gte(bookings.updated_at, thirtyAgo)),
      ),
      noShowsLast30: count(
        and(eq(bookings.attendance, 'no_show'), gte(bookings.starts_at, thirtyAgo)),
      ),
    },
    upcoming,
    recent,
    activity,
    health: {
      google: {
        connected: Boolean(token),
        email: token?.email ?? null,
        lastError: freeBusyStatusStore.lastError,
      },
      email: getEmailMode(),
      turnstile: isTurnstileEnabled(),
      failedJobs,
      lastBackupAt: lastBackupAt(),
    },
  });
}
