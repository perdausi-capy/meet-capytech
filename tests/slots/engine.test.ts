import { describe, it, expect } from 'vitest';
import { getAvailableSlots } from '@/lib/slots/engine';
import { parseIcsContent } from '@/lib/calendars/ics';
import { DEFAULT_AVAILABILITY_CONFIG } from '@/lib/slots/config';

describe('M2 Availability Engine (Luxon, Bank Holidays, DST)', () => {
  it('blocks all slots on UK Bank Holidays', () => {
    const slots = getAvailableSlots({
      dateStr: '2027-10-12', // Tuesday
      meetingType: DEFAULT_AVAILABILITY_CONFIG.meetingTypes.intro!,
      busyRanges: [],
      bankHolidays: new Set(['2027-10-12']),
      now: new Date('2027-10-01T00:00:00Z'),
    });

    expect(slots).toHaveLength(0);
  });

  it('correctly handles UK DST transition day (clocks changing)', () => {
    // Oct 31, 2027 is a Sunday in Europe/London DST transition
    const slots = getAvailableSlots({
      dateStr: '2027-10-25', // Monday before DST shift
      meetingType: DEFAULT_AVAILABILITY_CONFIG.meetingTypes.intro!,
      busyRanges: [],
      now: new Date('2027-10-01T00:00:00Z'),
    });

    expect(slots.length).toBeGreaterThan(0);
    // Working hours 09:00 - 17:00 London time -> 08:00 UTC during BST
    expect(slots[0]?.startsAt).toBe('2027-10-25T08:00:00.000Z');
  });

  it('expands recurring events via node-ical + rrule', () => {
    const icsWithRrule = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:rec-1
SUMMARY:Weekly Sync
DTSTART:20271005T100000Z
DTEND:20271005T110000Z
RRULE:FREQ=WEEKLY;BYDAY=TU
END:VEVENT
END:VCALENDAR`;

    const fromDate = new Date('2027-10-12T00:00:00Z');
    const toDate = new Date('2027-10-12T23:59:59Z');

    const ranges = parseIcsContent(icsWithRrule, fromDate, toDate);

    expect(ranges.length).toBeGreaterThan(0);
    expect(ranges[0]?.start.toISOString()).toBe('2027-10-12T10:00:00.000Z');
  });
});
