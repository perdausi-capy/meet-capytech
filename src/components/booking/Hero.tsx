'use client';

import { useRef } from 'react';
import { ArrowRight, Clock, Globe, MailCheck, Sparkles, Video } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import type { PublicMeetingType, PublicProfile } from '@/lib/use-public-config';
import { formatTime } from '@/lib/time-format';

/**
 * Portrait frame for the host. Shows `profile.avatarUrl` when set; until then a branded
 * placeholder fills the same space so the layout doesn't change when a photo is added.
 */
export function Portrait({
  profile,
  className = '',
  compact = false,
}: {
  profile: PublicProfile;
  className?: string;
  /** Small square (e.g. phones): no name overlay, smaller initial. */
  compact?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[2rem] border border-hairline shadow-card ${className}`}
    >
      {profile.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- runtime-configurable URL
        <img
          src={profile.avatarUrl}
          alt={`${profile.name}, ${profile.title} at ${profile.company}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={`${profile.name}, ${profile.title} at ${profile.company}`}
          className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-600 via-indigo-500 to-violet-500"
        >
          <svg
            aria-hidden
            className="absolute inset-0 h-full w-full opacity-25"
            viewBox="0 0 100 125"
          >
            {[18, 30, 42, 54, 66].map((r) => (
              <circle key={r} cx="50" cy="52" r={r} fill="none" stroke="white" strokeWidth="0.3" />
            ))}
          </svg>
          <span
            className={`relative font-display leading-none text-white/95 ${compact ? 'text-6xl' : 'text-[7rem] sm:text-[9rem]'}`}
          >
            {profile.name.charAt(0)}
          </span>
        </div>
      )}
      <div
        className={`absolute inset-x-3 bottom-3 items-center justify-between rounded-2xl bg-black/35 px-4 py-3 text-white backdrop-blur-md ${compact ? 'hidden' : 'flex'}`}
      >
        <div>
          <p className="text-sm font-semibold leading-tight">{profile.name}</p>
          <p className="text-xs text-white/75">
            {profile.title} · {profile.company}
          </p>
        </div>
        <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]" />
      </div>
    </div>
  );
}

export interface NextOpening {
  startsAt: string;
  meetingName: string;
  durationMinutes: number;
}

export function Hero({
  profile,
  meetingTypes,
  nextOpening,
  timezone,
  hour12,
  onBookNext,
}: {
  profile: PublicProfile;
  meetingTypes: PublicMeetingType[];
  nextOpening: NextOpening | null;
  timezone: string;
  hour12: boolean;
  onBookNext: () => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const durations = meetingTypes.map((t) => t.durationMinutes);
  const durationLabel =
    durations.length === 0
      ? ''
      : Math.min(...durations) === Math.max(...durations)
        ? `${durations[0]} min`
        : `${Math.min(...durations)}–${Math.max(...durations)} min`;

  useGsap(
    () => {
      const tl = gsap.timeline({ defaults: { ease: 'power4.out' } });
      tl.from('[data-anim="portrait"]', {
        clipPath: 'inset(100% 0% 0% 0% round 2rem)',
        duration: 1.2,
        clearProps: 'clipPath',
      })
        .from(
          '[data-anim="word"]',
          { yPercent: 110, duration: 1, stagger: 0.08, clearProps: 'transform' },
          '-=0.9',
        )
        .from(
          '[data-anim="hero-meta"]',
          { y: 16, opacity: 0, duration: 0.7, stagger: 0.08, clearProps: 'transform,opacity' },
          '-=0.6',
        );
    },
    [],
    rootRef,
  );

  return (
    <section
      ref={rootRef}
      aria-labelledby="hero-title"
      className="grid items-end gap-6 pt-2 sm:grid-cols-[minmax(0,220px)_1fr] sm:gap-8 lg:grid-cols-[minmax(0,300px)_1fr] lg:gap-12 lg:pt-6 xl:grid-cols-[minmax(0,300px)_1fr_320px]"
    >
      <div data-anim="portrait">
        {/* Phones: a small square so the headline stays on the first screen. */}
        <Portrait profile={profile} compact className="aspect-square w-24 rounded-3xl sm:hidden" />
        <Portrait profile={profile} className="hidden aspect-[4/5] w-full sm:block" />
      </div>

      <div className="min-w-0 pb-2 [container-type:inline-size]">
        <p
          data-anim="hero-meta"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-brand"
        >
          {profile.title} · {profile.company}
        </p>
        {/* One line, sized from this column's width (container units) so it always fits. */}
        <h1
          id="hero-title"
          className="mt-3 whitespace-nowrap font-display text-[clamp(2.25rem,17cqi,8.5rem)] leading-[1.02] tracking-[-0.02em] text-ink"
        >
          <span className="-ml-[0.04em] inline-block overflow-hidden pb-[0.12em] pl-[0.04em] align-bottom">
            <span data-anim="word" className="inline-block">
              Meet with
            </span>
          </span>{' '}
          <span className="-mr-[0.1em] inline-block overflow-hidden pb-[0.12em] pr-[0.1em] align-bottom">
            <span data-anim="word" className="inline-block italic text-brand">
              {profile.name}.
            </span>
          </span>
        </h1>
        <p
          data-anim="hero-meta"
          className="mt-5 max-w-2xl text-lg leading-relaxed text-ink-2 sm:text-xl"
        >
          {profile.bio}
        </p>
        <ul data-anim="hero-meta" className="mt-6 flex flex-wrap gap-2.5">
          <li className="chip">
            <Video className="h-4 w-4 text-brand" /> {profile.location}
          </li>
          {durationLabel && (
            <li className="chip">
              <Clock className="h-4 w-4 text-brand" /> {durationLabel}
            </li>
          )}
          <li className="chip">
            <Globe className="h-4 w-4 text-brand" /> Shown in your time zone
          </li>
          <li className="chip">
            <MailCheck className="h-4 w-4 text-brand" /> Invite sent instantly
          </li>
        </ul>
      </div>

      {/* Wide screens: the earliest free slot, bookable in one click. */}
      {nextOpening && (
        <aside data-anim="hero-meta" className="panel hidden flex-col p-7 xl:flex">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-brand">
            <Sparkles className="h-3.5 w-3.5" /> Earliest opening
          </p>
          <p className="mt-4 font-display text-6xl leading-none text-ink">
            {new Date(nextOpening.startsAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              timeZone: timezone,
            })}
            <span className="ml-2 font-sans text-lg font-medium text-ink-2">
              {new Date(nextOpening.startsAt).toLocaleDateString('en-GB', {
                weekday: 'long',
                timeZone: timezone,
              })}
              ,{' '}
              {new Date(nextOpening.startsAt).toLocaleDateString('en-GB', {
                month: 'long',
                timeZone: timezone,
              })}
            </span>
          </p>
          <p className="mt-3 text-2xl font-semibold tabular-nums text-ink">
            {formatTime(nextOpening.startsAt, timezone, hour12)}
          </p>
          <p className="mt-1 text-sm text-muted">
            {nextOpening.meetingName} · {nextOpening.durationMinutes} min
          </p>
          <button type="button" onClick={onBookNext} className="btn-primary focus-ring mt-6">
            Take this slot <ArrowRight className="h-4 w-4" />
          </button>
        </aside>
      )}
    </section>
  );
}
