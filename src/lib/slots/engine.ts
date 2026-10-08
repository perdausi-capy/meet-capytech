import { DateTime } from 'luxon';
import { AvailabilityConfig, MeetingType, Slot, TimeRange, DayOfWeek } from './types';
import { getAvailabilityConfig } from './config';
import { getAggregatedBusyRanges } from '../calendars/aggregator';
import { getUkBankHolidays } from '../calendars/bank-holidays';

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
}): Slot[] {
  const {
    dateStr,
    meetingType,
    busyRanges,
    bankHolidays = new Set(),
    now = new Date(),
    config = getAvailabilityConfig(),
  } = params;

  // A zero/negative step would never advance the cursor below and hang the request.
  if (!(config.slotIntervalMinutes > 0) || !(meetingType.durationMinutes > 0)) return [];

  if (bankHolidays.has(dateStr)) return [];

  const targetDt = DateTime.fromISO(dateStr, { zone: config.timezone });
  if (!targetDt.isValid) return [];

  const normalizedIsoDate = targetDt.toISODate();
  if (normalizedIsoDate && bankHolidays.has(normalizedIsoDate)) return [];

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

  const windows = config.workingHours[weekday] || [];
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

export async function getBookableSlots(dateStr: string, typeSlug: string): Promise<Slot[]> {
  const config = getAvailabilityConfig();
  const meetingType = config.meetingTypes[typeSlug];

  if (!meetingType) {
    throw new Error('Invalid meeting type');
  }

  const targetDt = DateTime.fromISO(dateStr, { zone: config.timezone });
  const fromDate = targetDt.startOf('day').toJSDate();
  const toDate = targetDt.endOf('day').toJSDate();

  const [busyRanges, bankHolidays] = await Promise.all([
    getAggregatedBusyRanges(fromDate, toDate),
    getUkBankHolidays(),
  ]);

  return getAvailableSlots({
    dateStr,
    meetingType,
    busyRanges,
    bankHolidays,
    config,
  });
}
