import { DateTime } from 'luxon';
import {
  AvailabilityConfig,
  AvailabilityOverride,
  MeetingType,
  Slot,
  TimeRange,
  DayOfWeek,
} from './types';
import { getAvailabilityConfig } from './config';
import { getAggregatedBusyRanges } from '../calendars/aggregator';
import { getUkBankHolidays } from '../calendars/bank-holidays';
import { getOverrides } from '../availability-overrides';
import { getMeetingTypeBySlug } from '../meeting-types';
import { getDb } from '../db';
import { bookings } from '../db/schema';
import { and, gte, inArray, lt } from 'drizzle-orm';

export function hasOverlap(a: TimeRange, b: TimeRange): boolean {
  return a.start < b.end && a.end > b.start;
}

export function getAvailableSlots(params: {
  dateStr: string; // YYYY-MM-DD
  meetingType: MeetingType;
  busyRanges: TimeRange[];
  bankHolidays?: Set<string>;
  now?: Date;
  config?: AvailabilityConfig;
  /** A one-off change for this date: `closed`, or custom windows instead of the weekly hours. */
  override?: AvailabilityOverride;
}): Slot[] {
  const {
    dateStr,
    meetingType,
    busyRanges,
    bankHolidays = new Set(),
    now = new Date(),
    config = getAvailabilityConfig(),
    override,
  } = params;

  // A zero/negative step would never advance the cursor below and hang the request.
  if (!(config.slotIntervalMinutes > 0) || !(meetingType.durationMinutes > 0)) return [];

  if (override?.kind === 'closed') return [];
  // Custom hours for a date win over the bank-holiday rule (e.g. working on a bank holiday).
  if (!override && bankHolidays.has(dateStr)) return [];

  const targetDt = DateTime.fromISO(dateStr, { zone: config.timezone });
  if (!targetDt.isValid) return [];

  const normalizedIsoDate = targetDt.toISODate();
  if (!override && normalizedIsoDate && bankHolidays.has(normalizedIsoDate)) return [];

  const dayMap: Record<number, DayOfWeek> = {
    1: 'monday',
    2: 'tuesday',
    3: 'wednesday',
    4: 'thursday',
    5: 'friday',
    6: 'saturday',
    7: 'sunday',
  };
  const weekday = dayMap[targetDt.weekday];

  // Guard against undefined to satisfy strict TypeScript rules
  if (!weekday) return [];

  const windows = override ? override.windows : config.workingHours[weekday] || [];
  if (windows.length === 0) return [];

  const nowDt = DateTime.fromJSDate(now, { zone: config.timezone });
  const minNoticeThreshold = nowDt.plus({ hours: config.minNoticeHours });
  const maxAdvanceThreshold = nowDt.plus({ days: config.maxAdvanceDays });

  const availableSlots: Slot[] = [];

  for (const window of windows) {
    const [startH, startM] = window.start.split(':').map(Number);
    const [endH, endM] = window.end.split(':').map(Number);

    let cursor = targetDt.set({
      hour: startH as number,
      minute: startM as number,
      second: 0,
      millisecond: 0,
    });
    const windowEnd = targetDt.set({
      hour: endH as number,
      minute: endM as number,
      second: 0,
      millisecond: 0,
    });

    while (cursor.plus({ minutes: meetingType.durationMinutes }) <= windowEnd) {
      const slotStart = cursor;
      const slotEnd = slotStart.plus({ minutes: meetingType.durationMinutes });

      const slotStartJs = slotStart.toJSDate();
      const slotEndJs = slotEnd.toJSDate();

      const requiredRangeWithBuffers: TimeRange = {
        start: slotStart.minus({ minutes: meetingType.bufferBeforeMinutes }).toJSDate(),
        end: slotEnd.plus({ minutes: meetingType.bufferAfterMinutes }).toJSDate(),
      };

      const satisfiesNotice = slotStart >= minNoticeThreshold;
      const satisfiesAdvance = slotStart <= maxAdvanceThreshold;
      const isCollision = busyRanges.some((busy) => hasOverlap(requiredRangeWithBuffers, busy));

      if (satisfiesNotice && satisfiesAdvance && !isCollision) {
        availableSlots.push({
          startsAt: slotStartJs.toISOString(),
          endsAt: slotEndJs.toISOString(),
        });
      }

      cursor = cursor.plus({ minutes: config.slotIntervalMinutes });
    }
  }

  return availableSlots;
}

export interface BookableOptions {
  /** Allow archived types (rescheduling an existing booking of a since-archived type). */
  includeArchived?: boolean;
  now?: Date;
}

export async function getBookableSlots(
  dateStr: string,
  typeSlug: string,
  options: BookableOptions = {},
): Promise<Slot[]> {
  return getBookableSlotsBetween(dateStr, dateStr, typeSlug, options);
}

/** Per host-calendar day: total active bookings and bookings of each type. */
export function countBookingsByHostDay(fromIso: string, toIso: string, timezone: string) {
  const rows = getDb()
    .select({ starts_at: bookings.starts_at, type_slug: bookings.type_slug })
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['pending', 'confirmed']),
        gte(bookings.starts_at, fromIso),
        lt(bookings.starts_at, toIso),
      ),
    )
    .all();
  const total = new Map<string, number>();
  const byType = new Map<string, number>();
  for (const r of rows) {
    const day = DateTime.fromISO(r.starts_at, { zone: timezone }).toISODate() as string;
    total.set(day, (total.get(day) ?? 0) + 1);
    byType.set(`${day}|${r.type_slug}`, (byType.get(`${day}|${r.type_slug}`) ?? 0) + 1);
  }
  return { total, byType };
}

// Upper bound on one range request, so a crafted query can't make us expand years of calendars.
const MAX_RANGE_DAYS = 62;

/**
 * Bookable slots for every host-calendar date from `fromDateStr` to `toDateStr` (inclusive),
 * reading the calendars once for the whole range. Applies date overrides and daily limits.
 * Dates outside the booking window are skipped without touching any calendar.
 */
export async function getBookableSlotsBetween(
  fromDateStr: string,
  toDateStr: string,
  typeSlug: string,
  options: BookableOptions = {},
): Promise<Slot[]> {
  const now = options.now ?? new Date();
  const config = getAvailabilityConfig();
  const meetingType =
    config.meetingTypes[typeSlug] ??
    (options.includeArchived ? getMeetingTypeBySlug(typeSlug, { includeArchived: true }) : null);

  if (!meetingType) {
    throw new Error('Invalid meeting type');
  }

  const today = DateTime.fromJSDate(now, { zone: config.timezone }).startOf('day');
  const lastBookable = today.plus({ days: config.maxAdvanceDays });
  let from = DateTime.fromISO(fromDateStr, { zone: config.timezone }).startOf('day');
  let to = DateTime.fromISO(toDateStr, { zone: config.timezone }).startOf('day');
  if (!from.isValid || !to.isValid) throw new Error('Invalid date');

  if (from < today) from = today;
  if (to > lastBookable) to = lastBookable;
  if (to < from) return [];
  if (to.diff(from, 'days').days > MAX_RANGE_DAYS) {
    to = from.plus({ days: MAX_RANGE_DAYS });
  }

  const rangeStart = from.toJSDate();
  const rangeEnd = to.endOf('day').toJSDate();
  const [busyRanges, bankHolidays] = await Promise.all([
    getAggregatedBusyRanges(rangeStart, rangeEnd),
    getUkBankHolidays(),
  ]);
  const overrides = getOverrides(from.toISODate() as string, to.toISODate() as string);
  const limited = Boolean(config.maxMeetingsPerDay || meetingType.maxPerDay);
  const counts = limited
    ? countBookingsByHostDay(rangeStart.toISOString(), rangeEnd.toISOString(), config.timezone)
    : null;

  const slots: Slot[] = [];
  for (let day = from; day <= to; day = day.plus({ days: 1 })) {
    const dateStr = day.toISODate() as string;
    if (counts) {
      if (
        config.maxMeetingsPerDay &&
        (counts.total.get(dateStr) ?? 0) >= config.maxMeetingsPerDay
      ) {
        continue;
      }
      if (
        meetingType.maxPerDay &&
        (counts.byType.get(`${dateStr}|${meetingType.slug}`) ?? 0) >= meetingType.maxPerDay
      ) {
        continue;
      }
    }
    slots.push(
      ...getAvailableSlots({
        dateStr,
        meetingType,
        busyRanges,
        bankHolidays,
        now,
        config,
        override: overrides.get(dateStr),
      }),
    );
  }
  return slots;
}
