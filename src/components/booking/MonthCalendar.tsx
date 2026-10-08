'use client';

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import type { DaySlots } from '@/lib/use-month-availability';
import { formatDateShort, formatMonthTitle, localDate, shiftMonth } from '@/lib/time-format';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function daysInMonth(month: string): string[] {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
}

/** Monday-first column (0–6) of a YYYY-MM-DD date. */
function weekdayIndex(dateStr: string): number {
  return (new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function MonthCalendar({
  month,
  onMonthChange,
  maxMonth,
  timezone,
  days,
  loading,
  error,
  onRetry,
  selectedDate,
  onSelectDate,
}: {
  /** YYYY-MM in the guest's zone. */
  month: string;
  onMonthChange: (month: string) => void;
  maxMonth: string;
  timezone: string;
  days: DaySlots;
  loading: boolean;
  error: string;
  onRetry: () => void;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const direction = useRef(0);
  const today = localDate(new Date(), timezone);
  const minMonth = today.slice(0, 7);
  const dates = useMemo(() => daysInMonth(month), [month]);
  const leading = weekdayIndex(dates[0] as string);
  const availableDates = useMemo(() => Object.keys(days).sort(), [days]);
  const [focusDate, setFocusDate] = useState<string | null>(null);

  const go = (delta: number) => {
    const next = shiftMonth(month, delta);
    if (next < minMonth || next > maxMonth) return;
    direction.current = delta;
    onMonthChange(next);
  };

  // Month change: slide the grid in from the side we navigated towards.
  useGsap(
    () => {
      gsap.from('[data-anim="grid"]', {
        x: direction.current * 28,
        opacity: 0,
        duration: 0.45,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('[data-anim="title"]', { y: 8, opacity: 0, duration: 0.35, ease: 'power2.out' });
    },
    [month],
    rootRef,
  );

  // A month's availability arrived for the first time: pop the bookable days in. Not replayed
  // when only the meeting type changes, so switching types doesn't make the calendar blink.
  const poppedMonth = useRef<string | null>(null);
  useGsap(
    () => {
      if (loading || poppedMonth.current === month) return;
      poppedMonth.current = month;
      // fromTo (not from): these buttons have CSS transitions, so their computed style can be
      // mid-transition here and must not be read as the end state.
      gsap.fromTo(
        '[data-available="true"]',
        { scale: 0.6, opacity: 0 },
        {
          scale: 1,
          opacity: 1,
          duration: 0.5,
          stagger: { amount: 0.35, grid: 'auto', from: 'start' },
          ease: 'back.out(2)',
          clearProps: 'transform,opacity',
        },
      );
    },
    [loading, month],
    rootRef,
  );

  // Keep keyboard focus on a sensible day when the month or data changes.
  useEffect(() => {
    if (focusDate && focusDate.startsWith(month)) return;
    setFocusDate(selectedDate?.startsWith(month) ? selectedDate : (availableDates[0] ?? null));
  }, [month, availableDates, selectedDate, focusDate]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
    if (!step || !focusDate) return;
    e.preventDefault();
    const next = addDays(focusDate, step);
    if (next.slice(0, 7) !== month) go(step > 0 ? 1 : -1);
    setFocusDate(next);
    requestAnimationFrame(() =>
      rootRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus(),
    );
  };

  // Skeleton only on a first load; when refetching (e.g. another meeting type) keep the current
  // days on screen, dimmed, so the calendar doesn't blank out.
  const skeleton = loading && availableDates.length === 0;
  const empty = !loading && !error && availableDates.length === 0;
  const canNext = shiftMonth(month, 1) <= maxMonth;

  return (
    <div ref={rootRef} className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <p data-anim="title" className="font-display text-3xl leading-none text-ink sm:text-4xl">
          {formatMonthTitle(month)}
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={month <= minMonth}
            aria-label="Previous month"
            className="icon-btn focus-ring"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={!canNext}
            aria-label="Next month"
            className="icon-btn focus-ring"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1.5 pb-3 text-center text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted sm:gap-2">
        {WEEKDAYS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="relative">
        <div
          data-anim="grid"
          role="group"
          aria-label={`Days in ${formatMonthTitle(month)}`}
          onKeyDown={onKeyDown}
          className="grid grid-cols-7 gap-1.5 sm:gap-2"
        >
          {Array.from({ length: leading }, (_, i) => (
            <div key={`pad-${i}`} />
          ))}
          {dates.map((date) => {
            const available = Boolean(days[date]?.length);
            const selected = date === selectedDate;
            const isToday = date === today;
            const label = `${formatDateShort(date)}${available ? `, ${days[date]?.length} times available` : ', unavailable'}`;
            return (
              <button
                key={date}
                type="button"
                data-date={date}
                data-available={available && !skeleton}
                disabled={!available || loading}
                aria-label={label}
                aria-pressed={selected}
                tabIndex={date === focusDate ? 0 : -1}
                onFocus={() => setFocusDate(date)}
                onClick={() => onSelectDate(date)}
                className={`focus-ring relative flex h-12 items-center justify-center rounded-2xl text-base tabular-nums transition-colors duration-150 sm:h-14 lg:h-16 lg:text-lg ${
                  skeleton
                    ? 'skeleton text-transparent'
                    : selected
                      ? 'bg-brand font-semibold text-white shadow-lift'
                      : available
                        ? `bg-brand-soft font-semibold text-brand-ink hover:bg-brand hover:text-white ${loading ? 'opacity-60' : ''}`
                        : 'cursor-default text-muted opacity-45'
                }`}
              >
                {Number(date.slice(8))}
                {isToday && !skeleton && (
                  <span
                    aria-hidden
                    className={`absolute bottom-1.5 h-1 w-1 rounded-full ${selected ? 'bg-white' : 'bg-brand'}`}
                  />
                )}
              </button>
            );
          })}
        </div>

        {(error || empty) && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl p-4">
            <div className="glass max-w-xs rounded-2xl border border-hairline p-5 text-center shadow-card">
              {error ? (
                <>
                  <p className="font-semibold text-ink">Couldn’t load availability</p>
                  <p className="mt-1 text-sm text-muted">{error}</p>
                  <button
                    type="button"
                    onClick={onRetry}
                    className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" /> Try again
                  </button>
                </>
              ) : (
                <>
                  <p className="font-semibold text-ink">No times in {formatMonthTitle(month)}</p>
                  {canNext ? (
                    <button
                      type="button"
                      onClick={() => go(1)}
                      className="focus-ring mt-3 inline-flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white"
                    >
                      Check {formatMonthTitle(shiftMonth(month, 1)).split(' ')[0]}
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <p className="mt-1 text-sm text-muted">Please check back soon.</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {!loading && !selectedDate && availableDates[0] && (
        <button
          type="button"
          onClick={() => onSelectDate(availableDates[0] as string)}
          className="focus-ring mt-4 self-start rounded-full text-sm font-medium text-brand underline-offset-4 hover:underline"
        >
          Next available: {formatDateShort(availableDates[0])} →
        </button>
      )}
    </div>
  );
}
