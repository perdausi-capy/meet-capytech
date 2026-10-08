'use client';

import { useEffect, useState } from 'react';
import { DateTime } from 'luxon';
import { cn } from '@/lib/utils';

interface Slot {
  startsAt: string;
  endsAt: string;
}

/**
 * The API serves slots per host-calendar date, but the guest picks a day in their own time zone.
 * A guest's day can span two host dates, so fetch each of them and keep the slots that fall on
 * the guest's chosen day.
 */
function hostDatesForGuestDay(dateStr: string, guestTz: string, hostTz: string): string[] {
  const dayStart = DateTime.fromISO(dateStr, { zone: guestTz }).startOf('day');
  const dayEnd = dayStart.endOf('day');
  const dates = [dayStart.setZone(hostTz).toISODate(), dayEnd.setZone(hostTz).toISODate()];
  return [...new Set(dates.filter((d): d is string => Boolean(d)))];
}

export function SlotList({
  dateStr,
  meetingType,
  guestTimezone,
  hostTimezone,
  selectedTime,
  onSelect,
}: {
  /** The day the guest picked, YYYY-MM-DD in guestTimezone. */
  dateStr: string;
  meetingType: string;
  guestTimezone: string;
  hostTimezone: string;
  selectedTime?: string;
  onSelect: (time: string) => void;
}) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!dateStr || !meetingType) return;

    let active = true;
    setLoading(true);
    setError('');

    const hostDates = hostDatesForGuestDay(dateStr, guestTimezone, hostTimezone);

    Promise.all(
      hostDates.map((d) =>
        fetch(`/api/slots?date=${d}&type=${encodeURIComponent(meetingType)}`).then((res) => {
          if (!res.ok) throw new Error('SLOT ENGINE ERROR');
          return res.json() as Promise<{ slots?: Slot[] }>;
        }),
      ),
    )
      .then((results) => {
        const onGuestDay = results
          .flatMap((r) => r.slots || [])
          .filter(
            (s) => DateTime.fromISO(s.startsAt).setZone(guestTimezone).toISODate() === dateStr,
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
        if (active) setSlots(onGuestDay);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dateStr, meetingType, guestTimezone, hostTimezone]);

  if (loading) {
    return (
      <div className="p-8 hairline-border bg-[var(--slot-bg)] text-center font-mono-spec text-xs tracking-widest text-[var(--slot-text)] uppercase font-bold">
        FETCHING AVAILABILITY...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 hairline-border border-red-600 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 font-mono-spec text-xs tracking-wider text-center uppercase font-bold">
        {error}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="p-8 hairline-border text-center font-mono-spec text-xs tracking-widest text-[var(--text-muted)] uppercase bg-[var(--surface)] font-bold">
        NO SLOTS AVAILABLE ON THIS DATE.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto pr-1">
      {slots.map((slot) => {
        const isSelected = selectedTime === slot.startsAt;
        const timeString = new Date(slot.startsAt).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: guestTimezone,
        });

        return (
          <button
            key={slot.startsAt}
            type="button"
            onClick={() => onSelect(slot.startsAt)}
            className={cn(
              'p-3 font-mono-spec text-xs tracking-wider transition-all cursor-pointer text-center border',
              isSelected
                ? 'bg-black dark:bg-white text-white dark:text-black font-extrabold border-black dark:border-white ring-2 ring-blue-600'
                : 'bg-[var(--slot-bg)] text-[var(--slot-text)] font-extrabold border-[var(--slot-border)] hover:bg-[var(--slot-hover)] hover:text-white',
            )}
          >
            {timeString}
          </button>
        );
      })}
    </div>
  );
}
