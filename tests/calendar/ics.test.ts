import { describe, it, expect } from 'vitest';
import { parseIcsContent } from '@/lib/calendars/ics';

describe('ICS Calendar Parser (node-ical)', () => {
  const sampleIcs = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Example Corp.//EN
BEGIN:VEVENT
UID:12345
DTSTART:20261012T100000Z
DTEND:20261012T110000Z
SUMMARY:Strategy Meeting
END:VEVENT
BEGIN:VEVENT
UID:67890
DTSTART:20261012T140000Z
DTEND:20261012T150000Z
STATUS:CANCELLED
SUMMARY:Cancelled Design Review
END:VEVENT
BEGIN:VEVENT
UID:all-day-1
DTSTART;VALUE=DATE:20261013
SUMMARY:All Day Outing
END:VEVENT
END:VCALENDAR`;

  it('correctly parses standard VEVENT blocks in UTC', () => {
    const fromDate = new Date('2026-10-12T00:00:00Z');
    const toDate = new Date('2026-10-12T23:59:59Z');
    const ranges = parseIcsContent(sampleIcs, fromDate, toDate);

    expect(ranges).toHaveLength(1); // One was cancelled, should be ignored
    expect(ranges[0]?.start.toISOString()).toBe('2026-10-12T10:00:00.000Z');
    expect(ranges[0]?.end.toISOString()).toBe('2026-10-12T11:00:00.000Z');
  });

  it('correctly parses ALL DAY events taking the entire UTC day', () => {
    const fromDate = new Date('2026-10-13T00:00:00Z');
    const toDate = new Date('2026-10-13T23:59:59Z');
    const ranges = parseIcsContent(sampleIcs, fromDate, toDate);

    expect(ranges).toHaveLength(1);
    expect(ranges[0]?.start.toISOString()).toBe('2026-10-13T00:00:00.000Z');
    expect(ranges[0]?.end.toISOString()).toBe('2026-10-14T00:00:00.000Z');
  });
});
