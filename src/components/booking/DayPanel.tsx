'use client';

import { useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock3, Loader2, Moon, Sun, Sunrise } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import type { Slot } from '@/lib/use-month-availability';
import { dayPartOf, formatTime, localHourMinute, type DayPart } from '@/lib/time-format';
import { TimeClockModal } from './TimeClockModal';
import { TimezoneSelect } from './TimezoneSelect';

const PARTS: { key: DayPart; label: string; icon: typeof Sun }[] = [
  { key: 'morning', label: 'Morning', icon: Sunrise },
  { key: 'afternoon', label: 'Afternoon', icon: Sun },
  { key: 'evening', label: 'Evening', icon: Moon },
];

export function DayPanel({
  date,
  slots,
  timezone,
  onTimezoneChange,
  hour12,
  onToggleHour12,
  durationMinutes,
  selectedTime,
  onSelectTime,
  onContinue,
  continueLabel = 'Continue',
  busy = false,
}: {
  date: string | null;
  slots: Slot[];
  timezone: string;
  onTimezoneChange: (tz: string) => void;
  hour12: boolean;
  onToggleHour12: (value: boolean) => void;
  durationMinutes: number;
  selectedTime: string | null;
  onSelectTime: (startsAt: string) => void;
  onContinue: () => void;
  continueLabel?: string;
  busy?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalPart, setModalPart] = useState<DayPart | null>(null);

  const parts = useMemo(() => {
    const groups: Record<DayPart, Slot[]> = { morning: [], afternoon: [], evening: [] };
    for (const s of slots) groups[dayPartOf(localHourMinute(s.startsAt, timezone).h)].push(s);
    return groups;
  }, [slots, timezone]);
  const maxCount = Math.max(1, ...Object.values(parts).map((p) => p.length));

  useGsap(
    () => {
      if (!date) return;
      gsap.from('[data-anim="day-big"]', {
        yPercent: 60,
        opacity: 0,
        duration: 0.6,
        ease: 'power4.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('[data-anim="part"]', {
        x: 16,
        opacity: 0,
        duration: 0.45,
        stagger: 0.06,
        delay: 0.1,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
      gsap.from('[data-anim="bar"]', {
        scaleX: 0,
        transformOrigin: 'left center',
        duration: 0.7,
        stagger: 0.06,
        delay: 0.2,
        ease: 'power3.out',
        clearProps: 'transform',
      });
    },
    [date],
    rootRef,
  );

  useGsap(
    () => {
      if (!selectedTime) return;
      gsap.from('[data-anim="chosen"]', {
        y: 14,
        opacity: 0,
        duration: 0.5,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    },
    [selectedTime],
    rootRef,
  );

  const openClock = (part: DayPart | null) => {
    setModalPart(part);
    setModalOpen(true);
  };

  const dateObj = date ? new Date(`${date}T12:00:00Z`) : null;
  const endIso = selectedTime
    ? new Date(new Date(selectedTime).getTime() + durationMinutes * 60_000).toISOString()
    : null;

  return (
    <div ref={rootRef} className="flex flex-1 flex-col">
      {!date || !dateObj ? (
        <div className="flex flex-1 flex-col justify-center py-4 sm:py-6">
          <p className="font-display text-4xl leading-[1.05] text-ink sm:text-6xl">
            Choose a <em className="text-brand">day</em>
            <br />
            to see times.
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted">
            Highlighted days have free times. Pick one and you’ll see how the day looks, then choose
            an exact time on the clock.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-end justify-between gap-4 overflow-hidden">
            <div data-anim="day-big" className="flex items-end gap-4">
              <span className="font-display text-[5.5rem] leading-[0.8] text-ink sm:text-[6.5rem]">
                {dateObj.getUTCDate()}
              </span>
              <span className="pb-1.5">
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-brand">
                  {dateObj.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
                </span>
                <span className="block text-lg font-medium text-ink-2">
                  {dateObj.toLocaleDateString('en-GB', {
                    month: 'long',
                    year: 'numeric',
                    timeZone: 'UTC',
                  })}
                </span>
              </span>
            </div>
            <span className="chip mb-1 shrink-0">
              <Clock3 className="h-3.5 w-3.5 text-brand" /> {slots.length} times
            </span>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            {PARTS.map(({ key, label, icon: Icon }) => {
              const list = parts[key];
              const first = list[0];
              const last = list[list.length - 1];
              return (
                <div key={key} data-anim="part">
                  <button
                    type="button"
                    disabled={list.length === 0}
                    onClick={() => openClock(key)}
                    className="tile focus-ring flex w-full items-center gap-4 px-4 py-3.5 text-left"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="font-semibold text-ink">{label}</span>
                        <span className="text-xs font-medium text-muted">
                          {list.length ? `${list.length} free` : 'No times'}
                        </span>
                      </span>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-hairline">
                        <span
                          data-anim="bar"
                          className="block h-full rounded-full bg-brand"
                          style={{ width: `${(list.length / maxCount) * 100}%` }}
                        />
                      </span>
                      {first && last && (
                        <span className="mt-1.5 block text-xs text-muted tabular-nums">
                          {formatTime(first.startsAt, timezone, hour12)} –{' '}
                          {formatTime(last.startsAt, timezone, hour12)}
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {selectedTime && endIso ? (
            <div
              data-anim="chosen"
              data-guide="continue"
              className="mt-5 rounded-2xl border border-brand bg-brand-soft p-5"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-brand">
                Your time
              </p>
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-3">
                <p className="font-display text-5xl leading-none text-ink tabular-nums">
                  {formatTime(selectedTime, timezone, hour12)}
                  <span className="ml-2 font-sans text-base text-ink-2">
                    – {formatTime(endIso, timezone, hour12)}
                  </span>
                </p>
                <button
                  type="button"
                  onClick={() => openClock(null)}
                  className="focus-ring rounded-lg text-sm font-semibold text-brand underline-offset-4 hover:underline"
                >
                  Change
                </button>
              </div>
              <button
                type="button"
                onClick={onContinue}
                disabled={busy}
                className="btn-primary focus-ring mt-5 w-full py-4 text-base"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {continueLabel} {!busy && <ArrowRight className="h-4 w-4" />}
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-guide="time-button"
              onClick={() => openClock(null)}
              className="btn-primary focus-ring mt-5 w-full py-4 text-base"
            >
              <Clock3 className="h-5 w-5" /> Choose a time
            </button>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-5">
        <TimezoneSelect value={timezone} onChange={onTimezoneChange} />
        <div className="segmented" role="group" aria-label="Clock format">
          <button type="button" aria-pressed={hour12} onClick={() => onToggleHour12(true)}>
            12h
          </button>
          <button type="button" aria-pressed={!hour12} onClick={() => onToggleHour12(false)}>
            24h
          </button>
        </div>
      </div>

      {date && (
        <TimeClockModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          date={date}
          slots={slots}
          timezone={timezone}
          hour12={hour12}
          onToggleHour12={onToggleHour12}
          durationMinutes={durationMinutes}
          initialTime={selectedTime}
          initialPart={modalPart}
          onConfirm={onSelectTime}
        />
      )}
    </div>
  );
}
