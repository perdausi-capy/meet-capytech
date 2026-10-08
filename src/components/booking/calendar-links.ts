export interface CalendarEvent {
  title: string;
  description: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  location?: string;
}

/** 20261014T090000Z */
function compactUtc(iso: string) {
  return new Date(iso)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${compactUtc(e.startsAt)}/${compactUtc(e.endsAt)}`,
    details: e.description,
  });
  if (e.location) params.set('location', e.location);
  return `https://calendar.google.com/calendar/render?${params}`;
}

export function outlookCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: new Date(e.startsAt).toISOString(),
    enddt: new Date(e.endsAt).toISOString(),
    body: e.description,
  });
  if (e.location) params.set('location', e.location);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}

function escapeIcs(text: string) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

export function icsDataUrl(e: CalendarEvent, uid: string): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Capytech UK//meet//EN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@meet.capytech.co.uk`,
    `DTSTAMP:${compactUtc(new Date().toISOString())}`,
    `DTSTART:${compactUtc(e.startsAt)}`,
    `DTEND:${compactUtc(e.endsAt)}`,
    `SUMMARY:${escapeIcs(e.title)}`,
    `DESCRIPTION:${escapeIcs(e.description)}`,
    ...(e.location ? [`LOCATION:${escapeIcs(e.location)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`;
}
