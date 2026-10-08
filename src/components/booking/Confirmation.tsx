'use client';

import { useRef } from 'react';
import { CalendarPlus, Download, ExternalLink, Mail, Settings2 } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import {
  googleCalendarUrl,
  icsDataUrl,
  outlookCalendarUrl,
  type CalendarEvent,
} from './calendar-links';

export function Confirmation({
  hostName,
  email,
  summary,
  calendarEvent,
  bookingId,
  meetLink,
  manageUrl,
}: {
  hostName: string;
  email: string;
  summary: React.ReactNode;
  calendarEvent: CalendarEvent;
  bookingId: string;
  meetLink?: string;
  manageUrl?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
      tl.from('[data-anim="badge"]', {
        scale: 0.4,
        opacity: 0,
        duration: 0.6,
        ease: 'back.out(2.2)',
      })
        .fromTo(
          '[data-anim="check"]',
          { strokeDashoffset: 48 },
          { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' },
          '-=0.25',
        )
        .from(
          '[data-anim="ring"]',
          { scale: 0.6, opacity: 0.8, duration: 1.1, ease: 'power2.out' },
          '<',
        )
        .from('[data-anim="item"]', { y: 16, opacity: 0, duration: 0.55, stagger: 0.08 }, '-=0.6');
    },
    [],
    rootRef,
  );

  const linkClass =
    'focus-ring inline-flex items-center justify-center gap-2 rounded-xl border border-hairline bg-card-solid px-4 py-2.5 text-sm font-semibold text-ink-2 transition-all hover:-translate-y-0.5 hover:border-brand hover:text-brand';

  return (
    <div ref={rootRef} className="flex flex-col items-center text-center" aria-live="polite">
      <div className="relative mb-6 mt-2">
        <span
          data-anim="ring"
          aria-hidden
          className="absolute inset-0 -m-3 rounded-full border-2 border-success opacity-0"
        />
        <div
          data-anim="badge"
          className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg"
        >
          <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" aria-hidden>
            <path
              data-anim="check"
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke="currentColor"
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="48"
            />
          </svg>
        </div>
      </div>

      <h2 data-anim="item" className="font-display text-4xl leading-tight text-ink">
        You’re booked with {hostName}
      </h2>
      <p data-anim="item" className="mt-2 inline-flex items-center gap-1.5 text-sm text-muted">
        <Mail className="h-4 w-4" /> A calendar invite and confirmation are on their way to{' '}
        <strong className="font-semibold text-ink-2">{email}</strong>
      </p>

      <div data-anim="item" className="mt-6 w-full max-w-md text-left">
        {summary}
      </div>

      {meetLink && (
        <div data-anim="item">
          <a
            href={meetLink}
            target="_blank"
            rel="noreferrer"
            className="focus-ring mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 font-semibold text-white shadow-lift transition-colors hover:bg-brand-strong"
          >
            Join video call <ExternalLink className="h-4 w-4" />
          </a>
        </div>
      )}

      <div data-anim="item" className="mt-6 w-full max-w-md">
        <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-muted">
          <CalendarPlus className="h-3.5 w-3.5" /> Add to calendar
        </p>
        <div className="grid grid-cols-3 gap-2">
          <a
            className={linkClass}
            href={googleCalendarUrl(calendarEvent)}
            target="_blank"
            rel="noreferrer"
          >
            Google
          </a>
          <a
            className={linkClass}
            href={outlookCalendarUrl(calendarEvent)}
            target="_blank"
            rel="noreferrer"
          >
            Outlook
          </a>
          <a
            className={linkClass}
            href={icsDataUrl(calendarEvent, bookingId)}
            download="meeting.ics"
          >
            <Download className="h-4 w-4" /> .ics
          </a>
        </div>
      </div>

      {manageUrl && (
        <div data-anim="item">
          <a
            href={manageUrl}
            className="focus-ring mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-brand underline-offset-4 hover:underline"
          >
            <Settings2 className="h-4 w-4" /> Reschedule or cancel
          </a>
        </div>
      )}
    </div>
  );
}
