'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export function DayPicker({
  selectedDate,
  onSelect,
}: {
  selectedDate?: Date;
  onSelect: (date: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date();
  maxDate.setDate(today.getDate() + 60);

  const days = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1));
  const blanks = Array.from({ length: firstDay }, (_, i) => i);

  const nextMonth = () => setCurrentMonth(new Date(year, month + 1, 1));
  const prevMonth = () => setCurrentMonth(new Date(year, month - 1, 1));

  return (
    <div className="w-full space-y-4">
      {/* Month Navigation Header */}
      <div className="flex items-center justify-between pb-3 hairline-b">
        <span className="font-mono-spec text-xs uppercase tracking-widest text-[var(--text-primary)] font-bold">
          {currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={prevMonth}
            aria-label="Previous Month"
            className="p-1.5 rounded-lg hairline-border text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={nextMonth}
            aria-label="Next Month"
            className="p-1.5 rounded-lg hairline-border text-[var(--text-primary)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Weekday Header */}
      <div className="grid grid-cols-7 text-center font-mono-spec text-[10px] uppercase tracking-widest text-[var(--text-muted)] font-extrabold mb-1">
        {['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 border hairline-border bg-[var(--line)] gap-[1px]">
        {blanks.map((b) => (
          <div key={`blank-${b}`} className="bg-[var(--surface)] aspect-square" />
        ))}
        {days.map((date) => {
          const isSelected = selectedDate?.toDateString() === date.toDateString();
          const isPast = date < today;
          const isTooFar = date > maxDate;
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const disabled = isPast || isTooFar || isWeekend;

          return (
            <button
              key={date.toISOString()}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(date)}
              className={cn(
                'aspect-square w-full font-mono-spec text-xs flex items-center justify-center transition-all',
                isSelected &&
                  'bg-black dark:bg-white text-white dark:text-black font-extrabold cursor-pointer ring-2 ring-blue-600 z-10',
                !isSelected &&
                  !disabled &&
                  'bg-[var(--slot-bg)] text-[var(--slot-text)] font-extrabold border border-[var(--slot-border)] hover:bg-[var(--slot-hover)] hover:text-white cursor-pointer shadow-sm',
                disabled &&
                  'bg-[var(--surface)] text-[var(--text-muted)] cursor-not-allowed opacity-30',
              )}
            >
              {String(date.getDate()).padStart(2, '0')}
            </button>
          );
        })}
      </div>

      {/* Visual Legend */}
      <div className="flex flex-wrap items-center gap-4 font-mono-spec text-[10px] uppercase tracking-wider text-[var(--text-muted)] font-bold pt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[var(--slot-bg)] border border-[var(--slot-border)] rounded-sm inline-block" />
          <span>AVAILABLE</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-black dark:bg-white rounded-sm inline-block" />
          <span>SELECTED</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 bg-[var(--surface)] border hairline-border rounded-sm inline-block opacity-60" />
          <span>UNAVAILABLE</span>
        </div>
      </div>
    </div>
  );
}
