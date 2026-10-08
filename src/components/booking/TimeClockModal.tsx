'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { gsap, prefersReducedMotion } from '@/lib/motion';
import { useSuspendGuide } from './Guide';
import type { Slot } from '@/lib/use-month-availability';
import {
  dayPartOf,
  formatDateLong,
  formatTime,
  localHourMinute,
  type DayPart,
} from '@/lib/time-format';

interface Entry {
  startsAt: string;
  h: number;
  m: number;
}

type Period = 'am' | 'pm';
type Mode = 'hour' | 'minute';

const SIZE = 300;
const C = SIZE / 2;
const R = 112; // radius of the number ring

function pos(i: number) {
  const a = ((i * 30 - 90) * Math.PI) / 180;
  return { x: C + R * Math.cos(a), y: C + R * Math.sin(a) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function TimeClockModal({
  open,
  onClose,
  date,
  slots,
  timezone,
  hour12,
  onToggleHour12,
  durationMinutes,
  initialTime,
  initialPart,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  date: string;
  slots: Slot[];
  timezone: string;
  hour12: boolean;
  onToggleHour12: (value: boolean) => void;
  durationMinutes: number;
  initialTime: string | null;
  /** Open on the first time of this part of the day (from the day panel's summary rows). */
  initialPart?: DayPart | null;
  onConfirm: (startsAt: string) => void;
}) {
  const entries = useMemo<Entry[]>(
    () => slots.map((s) => ({ startsAt: s.startsAt, ...localHourMinute(s.startsAt, timezone) })),
    [slots, timezone],
  );

  const [period, setPeriod] = useState<Period>('am');
  const [mode, setMode] = useState<Mode>('hour');
  const [hour, setHour] = useState<number | null>(null);
  const [minute, setMinute] = useState<number | null>(null);

  // The clock has its own instructions; the booking guide steps aside while it's open.
  useSuspendGuide(open);

  const backdropRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const handRef = useRef<SVGGElement>(null);
  const numbersRef = useRef<SVGGElement>(null);
  const openerRef = useRef<Element | null>(null);
  const closing = useRef(false);

  // (Re)initialise each time the modal opens.
  useEffect(() => {
    if (!open) return;
    closing.current = false;
    openerRef.current = document.activeElement;
    const start =
      entries.find((e) => e.startsAt === initialTime) ??
      (initialPart ? entries.find((e) => dayPartOf(e.h) === initialPart) : undefined) ??
      entries[0];
    if (start) {
      setPeriod(start.h < 12 ? 'am' : 'pm');
      setHour(start.h);
      const exact = start.startsAt === initialTime;
      setMinute(exact ? start.m : null);
      setMode(exact ? 'minute' : 'hour');
    }
  }, [open, entries, initialTime, initialPart]);

  // Entrance animation, scroll lock and initial focus.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (!prefersReducedMotion()) {
      gsap.fromTo(backdropRef.current, { opacity: 0 }, { opacity: 1, duration: 0.25 });
      gsap.fromTo(
        panelRef.current,
        { y: 40, scale: 0.96, opacity: 0 },
        { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: 'power3.out' },
      );
    }
    requestAnimationFrame(() => panelRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const requestClose = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    const done = () => {
      onClose();
      (openerRef.current as HTMLElement | null)?.focus?.();
    };
    if (prefersReducedMotion()) return done();
    gsap.to(backdropRef.current, { opacity: 0, duration: 0.2 });
    gsap.to(panelRef.current, {
      y: 30,
      opacity: 0,
      duration: 0.22,
      ease: 'power2.in',
      onComplete: done,
    });
  }, [onClose]);

  const hourValue = (i: number) => (period === 'am' ? i : i + 12);
  const hasPeriod = (p: Period) => entries.some((e) => (p === 'am' ? e.h < 12 : e.h >= 12));
  const minutesInHour = hour === null ? [] : entries.filter((e) => e.h === hour);
  const selected =
    hour !== null && minute !== null
      ? (entries.find((e) => e.h === hour && e.m === minute) ?? null)
      : null;

  // Which dial position the hand points at.
  const handIndex =
    mode === 'hour'
      ? hour !== null && (hour < 12 ? 'am' : 'pm') === period
        ? hour % 12
        : null
      : minute !== null && minute % 5 === 0
        ? minute / 5
        : null;

  useEffect(() => {
    if (!open || !handRef.current) return;
    if (handIndex === null) {
      gsap.to(handRef.current, { opacity: 0, duration: 0.15 });
      return;
    }
    const rotation = handIndex * 30;
    if (prefersReducedMotion()) {
      gsap.set(handRef.current, { rotation, svgOrigin: `${C} ${C}`, opacity: 1 });
      return;
    }
    gsap.to(handRef.current, {
      rotation,
      svgOrigin: `${C} ${C}`,
      opacity: 1,
      duration: 0.5,
      ease: 'power3.out',
    });
  }, [open, handIndex]);

  // Numbers swap between hours and minutes.
  useEffect(() => {
    if (!open || !numbersRef.current || prefersReducedMotion()) return;
    gsap.fromTo(
      numbersRef.current,
      { scale: 0.86, opacity: 0, svgOrigin: `${C} ${C}` },
      { scale: 1, opacity: 1, duration: 0.35, ease: 'power3.out' },
    );
  }, [open, mode, period]);

  const pickHour = (h: number) => {
    setHour(h);
    const options = entries.filter((e) => e.h === h);
    // A single option in that hour: select it straight away.
    if (options.length === 1) {
      setMinute(options[0]!.m);
    } else {
      setMinute(null);
    }
    setMode('minute');
  };

  const switchPeriod = (p: Period) => {
    if (p === period) return;
    setPeriod(p);
    setMode('hour');
    if (hour !== null && (hour < 12 ? 'am' : 'pm') !== p) {
      setHour(null);
      setMinute(null);
    }
  };

  const trapFocus = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = Array.from(
      panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex="0"]'),
    );
    if (focusable.length === 0) return;
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open || typeof document === 'undefined') return null;

  const hourLabel = hour === null ? '--' : hour12 ? String(hour % 12 || 12) : pad2(hour);
  const minuteLabel = minute === null ? '--' : pad2(minute);
  const endIso = selected
    ? new Date(new Date(selected.startsAt).getTime() + durationMinutes * 60_000).toISOString()
    : null;

  const segmentClass = (active: boolean) =>
    `focus-ring rounded-2xl px-2 transition-colors ${
      active ? 'bg-brand-soft text-brand' : 'text-ink hover:text-brand'
    }`;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center font-sans sm:items-center sm:p-6">
      <div
        ref={backdropRef}
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
        onClick={requestClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clock-title"
        tabIndex={-1}
        onKeyDown={trapFocus}
        className="relative max-h-[100dvh] w-full overflow-y-auto rounded-t-[2rem] border border-hairline bg-card-solid p-6 shadow-2xl outline-none sm:max-w-[460px] sm:rounded-[2rem] sm:p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
              Pick a time
            </p>
            <h2 id="clock-title" className="mt-1 text-lg font-semibold text-ink">
              {formatDateLong(date)}
            </h2>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close"
            className="icon-btn focus-ring shrink-0"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Digital readout: tap the hour or minutes to edit that part on the dial. */}
        <div className="mt-6 flex items-end justify-between gap-4">
          <div
            className="flex items-baseline font-display text-[4.5rem] leading-none tabular-nums"
            aria-live="polite"
          >
            <button
              type="button"
              aria-label="Edit hour"
              aria-pressed={mode === 'hour'}
              onClick={() => setMode('hour')}
              className={segmentClass(mode === 'hour')}
            >
              {hourLabel}
            </button>
            <span className="px-0.5 text-muted">:</span>
            <button
              type="button"
              aria-label="Edit minutes"
              aria-pressed={mode === 'minute'}
              onClick={() => hour !== null && setMode('minute')}
              disabled={hour === null}
              className={segmentClass(mode === 'minute')}
            >
              {minuteLabel}
            </button>
          </div>
          <div className="flex flex-col items-end gap-2 pb-2">
            <div className="segmented" role="group" aria-label="Part of day">
              {(['am', 'pm'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={period === p}
                  disabled={!hasPeriod(p)}
                  onClick={() => switchPeriod(p)}
                >
                  {hour12 ? p.toUpperCase() : p === 'am' ? '00–11' : '12–23'}
                </button>
              ))}
            </div>
            <div className="segmented" role="group" aria-label="Clock format">
              <button type="button" aria-pressed={hour12} onClick={() => onToggleHour12(true)}>
                12h
              </button>
              <button type="button" aria-pressed={!hour12} onClick={() => onToggleHour12(false)}>
                24h
              </button>
            </div>
          </div>
        </div>

        {/* Analog dial */}
        <div className="mx-auto mt-6 aspect-square w-full max-w-[300px]">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-full w-full select-none">
            <circle cx={C} cy={C} r={C - 4} className="fill-brand-soft" />
            <circle
              cx={C}
              cy={C}
              r={C - 4}
              fill="none"
              className="stroke-hairline"
              strokeWidth="1"
            />
            <g ref={handRef} style={{ opacity: 0 }}>
              <line
                x1={C}
                y1={C}
                x2={C}
                y2={C - R}
                className="stroke-brand"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <circle cx={C} cy={C - R} r="22" className="fill-brand" />
            </g>
            <circle cx={C} cy={C} r="5" className="fill-brand" />
            <g ref={numbersRef}>
              {Array.from({ length: 12 }, (_, i) => {
                const { x, y } = pos(i);
                let label: string;
                let enabled: boolean;
                let count = 0;
                let onPick: () => void;
                let aria: string;
                if (mode === 'hour') {
                  const h = hourValue(i);
                  count = entries.filter((e) => e.h === h).length;
                  enabled = count > 0;
                  label = hour12 ? String(i === 0 ? 12 : i) : pad2(h);
                  onPick = () => pickHour(h);
                  aria = `${hour12 ? `${i === 0 ? 12 : i} ${period.toUpperCase()}` : `${pad2(h)}:00`}, ${
                    enabled ? `${count} time${count === 1 ? '' : 's'}` : 'unavailable'
                  }`;
                } else {
                  const m = i * 5;
                  const entry = minutesInHour.find((e) => e.m === m);
                  enabled = Boolean(entry);
                  label = pad2(m);
                  onPick = () => setMinute(m);
                  aria = `${hourLabel}:${pad2(m)}${enabled ? '' : ', unavailable'}`;
                }
                const isActive = i === handIndex;
                return (
                  <g
                    key={`${mode}-${i}`}
                    role="button"
                    tabIndex={enabled ? 0 : -1}
                    aria-label={aria}
                    aria-disabled={!enabled}
                    aria-pressed={isActive}
                    onClick={() => enabled && onPick()}
                    onKeyDown={(e) => {
                      if (enabled && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault();
                        onPick();
                      }
                    }}
                    className={`group outline-none ${enabled ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                  >
                    <circle
                      cx={x}
                      cy={y}
                      r="22"
                      className={`transition-colors ${
                        isActive
                          ? 'fill-transparent'
                          : enabled
                            ? 'fill-card-solid group-hover:fill-brand group-focus-visible:fill-brand'
                            : 'fill-transparent'
                      }`}
                    />
                    <text
                      x={x}
                      y={y}
                      textAnchor="middle"
                      dominantBaseline="central"
                      className={`text-[15px] font-semibold tabular-nums transition-colors ${
                        isActive
                          ? 'fill-white'
                          : enabled
                            ? 'fill-ink group-hover:fill-white group-focus-visible:fill-white'
                            : 'fill-muted opacity-40'
                      }`}
                    >
                      {label}
                    </text>
                    {mode === 'hour' && enabled && !isActive && (
                      <circle cx={x} cy={y + 13} r="2" className="fill-brand" />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* Exact options for the chosen hour (also covers times that aren't on the 5-minute dial). */}
        {mode === 'minute' && minutesInHour.length > 0 && (
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {minutesInHour.map((e) => (
              <button
                key={e.startsAt}
                type="button"
                aria-pressed={minute === e.m}
                onClick={() => setMinute(e.m)}
                className={`focus-ring rounded-full border px-3.5 py-1.5 text-sm font-semibold tabular-nums transition-colors ${
                  minute === e.m
                    ? 'border-brand bg-brand text-white'
                    : 'border-hairline text-ink-2 hover:border-brand hover:text-brand'
                }`}
              >
                {formatTime(e.startsAt, timezone, hour12)}
              </button>
            ))}
          </div>
        )}

        <div className="mt-7 flex flex-col gap-4 border-t border-hairline pt-5">
          <p className="text-sm text-muted">
            {selected && endIso ? (
              <>
                <span className="font-semibold text-ink">
                  {formatTime(selected.startsAt, timezone, hour12)} –{' '}
                  {formatTime(endIso, timezone, hour12)}
                </span>{' '}
                · {durationMinutes} min
              </>
            ) : mode === 'hour' ? (
              'Choose an hour. Dots mark hours with free times.'
            ) : (
              'Now choose the minutes.'
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={requestClose} className="btn-secondary focus-ring">
              Cancel
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => {
                if (!selected) return;
                onConfirm(selected.startsAt);
                requestClose();
              }}
              className="btn-primary focus-ring"
            >
              Use this time
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
