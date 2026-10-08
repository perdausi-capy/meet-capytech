import { DateTime } from 'luxon';
import type { EmailMessage } from './send';

const BRAND = 'Capytech UK';
const ACCENT = '#2563eb';

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface BookingEmailData {
  guestName: string;
  guestEmail: string;
  meetingName: string;
  startsAt: string; // ISO UTC
  endsAt: string; // ISO UTC
  /** Zone to show times in: the guest's, falling back to the host's. */
  displayTimezone: string;
  hostTimezone: string;
  manageUrl?: string;
  meetLink?: string;
  bookAgainUrl: string;
}

/** e.g. "Thursday 8 October 2026 · 10:00–10:30 (Europe/London)". */
export function formatWhen(startsAt: string, endsAt: string, zone: string): string {
  const start = DateTime.fromISO(startsAt).setZone(zone);
  const end = DateTime.fromISO(endsAt).setZone(zone);
  return `${start.toFormat('cccc d LLLL yyyy')} · ${start.toFormat('HH:mm')}–${end.toFormat('HH:mm')} (${zone})`;
}

function whenLines(d: BookingEmailData): string[] {
  const lines = [formatWhen(d.startsAt, d.endsAt, d.displayTimezone)];
  if (d.displayTimezone !== d.hostTimezone) {
    lines.push(`Host time: ${formatWhen(d.startsAt, d.endsAt, d.hostTimezone)}`);
  }
  return lines;
}

function button(href: string, label: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;background:${ACCENT};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:8px;margin:4px 8px 4px 0">${escapeHtml(label)}</a>`;
}

function layout(
  title: string,
  intro: string,
  rows: [string, string][],
  actions: string,
  footer: string,
) {
  const rowsHtml = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#6b7280;width:110px;vertical-align:top">${escapeHtml(label)}</td><td style="padding:6px 0;color:#111827">${value}</td></tr>`,
    )
    .join('');

  return `<!doctype html>
<html><body style="margin:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="padding:20px 28px;border-bottom:1px solid #eef0f3;font-weight:700;color:#111827">${BRAND}</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 8px;font-size:22px;color:#111827">${escapeHtml(title)}</h1>
<p style="margin:0 0 20px;color:#374151">${intro}</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;margin-bottom:20px">${rowsHtml}</table>
<div>${actions}</div>
</td></tr>
<tr><td style="padding:16px 28px;background:#fafafa;color:#9ca3af;font-size:12px">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function textBlock(title: string, intro: string, rows: [string, string][], links: string[]) {
  return [
    title,
    '',
    intro,
    '',
    ...rows.map(([l, v]) => `${l}: ${v}`),
    '',
    ...links,
    '',
    `— ${BRAND}`,
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export function bookingConfirmedEmail(d: BookingEmailData): EmailMessage {
  const title = 'Your meeting is booked';
  const name = escapeHtml(d.guestName);
  const when = whenLines(d);
  const rows: [string, string][] = [
    ['Meeting', escapeHtml(d.meetingName)],
    ['When', when.map(escapeHtml).join('<br>')],
  ];
  if (d.meetLink)
    rows.push([
      'Video',
      `<a href="${escapeHtml(d.meetLink)}" style="color:${ACCENT}">${escapeHtml(d.meetLink)}</a>`,
    ]);

  const actions = [
    d.meetLink && button(d.meetLink, 'Join video call'),
    d.manageUrl && button(d.manageUrl, 'Reschedule or cancel'),
  ]
    .filter(Boolean)
    .join('');

  return {
    to: d.guestEmail,
    subject: `Confirmed: ${d.meetingName} on ${DateTime.fromISO(d.startsAt).setZone(d.displayTimezone).toFormat('d LLL, HH:mm')}`,
    html: layout(
      title,
      `Hi ${name}, thanks for booking. A calendar invitation is on its way too.`,
      rows,
      actions,
      'Need to change something? Use the link above at least 2 hours before the start time.',
    ),
    text: textBlock(
      title,
      `Hi ${d.guestName}, thanks for booking. A calendar invitation is on its way too.`,
      [
        ['Meeting', d.meetingName],
        ['When', when.join(' / ')],
        ...(d.meetLink ? [['Video', d.meetLink] as [string, string]] : []),
      ],
      d.manageUrl ? [`Reschedule or cancel: ${d.manageUrl}`] : [],
    ),
  };
}

export function bookingRescheduledEmail(d: BookingEmailData): EmailMessage {
  const title = 'Your meeting has moved';
  const when = whenLines(d);
  const rows: [string, string][] = [
    ['Meeting', escapeHtml(d.meetingName)],
    ['New time', when.map(escapeHtml).join('<br>')],
  ];
  if (d.meetLink)
    rows.push([
      'Video',
      `<a href="${escapeHtml(d.meetLink)}" style="color:${ACCENT}">${escapeHtml(d.meetLink)}</a>`,
    ]);

  const actions = [
    d.meetLink && button(d.meetLink, 'Join video call'),
    d.manageUrl && button(d.manageUrl, 'Manage booking'),
  ]
    .filter(Boolean)
    .join('');

  return {
    to: d.guestEmail,
    subject: `Rescheduled: ${d.meetingName} is now ${DateTime.fromISO(d.startsAt).setZone(d.displayTimezone).toFormat('d LLL, HH:mm')}`,
    html: layout(
      title,
      `Hi ${escapeHtml(d.guestName)}, your booking is confirmed for the new time below. Your previous link no longer works; use the one in this email.`,
      rows,
      actions,
      'An updated calendar invitation has been sent separately.',
    ),
    text: textBlock(
      title,
      `Hi ${d.guestName}, your booking is confirmed for the new time below.`,
      [
        ['Meeting', d.meetingName],
        ['New time', when.join(' / ')],
        ...(d.meetLink ? [['Video', d.meetLink] as [string, string]] : []),
      ],
      d.manageUrl ? [`Manage booking: ${d.manageUrl}`] : [],
    ),
  };
}

export function bookingCancelledEmail(d: BookingEmailData): EmailMessage {
  const title = 'Your meeting is cancelled';
  const when = whenLines(d);
  const rows: [string, string][] = [
    ['Meeting', escapeHtml(d.meetingName)],
    ['Was', when.map(escapeHtml).join('<br>')],
  ];

  return {
    to: d.guestEmail,
    subject: `Cancelled: ${d.meetingName} on ${DateTime.fromISO(d.startsAt).setZone(d.displayTimezone).toFormat('d LLL, HH:mm')}`,
    html: layout(
      title,
      `Hi ${escapeHtml(d.guestName)}, your booking has been cancelled. If that was a mistake, you can pick a new time any time.`,
      rows,
      button(d.bookAgainUrl, 'Book a new time'),
      'You don’t need to do anything else.',
    ),
    text: textBlock(
      title,
      `Hi ${d.guestName}, your booking has been cancelled.`,
      [
        ['Meeting', d.meetingName],
        ['Was', when.join(' / ')],
      ],
      [`Book a new time: ${d.bookAgainUrl}`],
    ),
  };
}
