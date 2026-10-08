/** Display helpers for the guest pages. All take an IANA zone so output matches the guest's choice. */

export function formatTime(iso: string, timeZone: string, hour12: boolean): string {
  return new Date(iso).toLocaleTimeString('en-GB', {
    hour: hour12 ? 'numeric' : '2-digit',
    minute: '2-digit',
    hour12,
    timeZone,
  });
}

/** "Wednesday 14 October" for a YYYY-MM-DD date (a calendar date, no zone conversion). */
export function formatDateLong(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}

/** "Wed 14 Oct" for a YYYY-MM-DD date. */
export function formatDateShort(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/** "Wednesday 14 October 2026" for an instant in a zone. */
export function formatInstantDate(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  });
}

/** YYYY-MM-DD of an instant in a zone. */
export function localDate(iso: string | Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date(iso));
}

/** "GMT+8" style offset label for a zone right now. */
export function zoneOffsetLabel(timeZone: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? '';
  } catch {
    return '';
  }
}

/** Whether the guest's locale normally uses a 12-hour clock. */
export function localePrefers12h(): boolean {
  try {
    return (
      new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hour12 === true
    );
  } catch {
    return false;
  }
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthTitle(month: string): string {
  return new Date(`${month}-15T12:00:00Z`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const hmFormatters = new Map<string, Intl.DateTimeFormat>();

/** Hour (0–23) and minute of an instant in a zone. */
export function localHourMinute(iso: string, timeZone: string): { h: number; m: number } {
  let fmt = hmFormatters.get(timeZone);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    hmFormatters.set(timeZone, fmt);
  }
  const parts = fmt.formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { h: get('hour') % 24, m: get('minute') };
}

export type DayPart = 'morning' | 'afternoon' | 'evening';

export function dayPartOf(hour: number): DayPart {
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}
