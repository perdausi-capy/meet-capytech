'use client';

import { useRef } from 'react';
import { Check, Video } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import type { PublicMeetingType } from '@/lib/use-public-config';

/**
 * Meeting type picker. A responsive grid so it works for two types today and many more once
 * they are managed from the admin.
 */
export function MeetingTypeGrid({
  types,
  selected,
  onSelect,
  location,
}: {
  types: PublicMeetingType[];
  selected: string | null;
  onSelect: (slug: string) => void;
  location: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      gsap.from('[data-anim="type"]', {
        y: 24,
        opacity: 0,
        duration: 0.7,
        stagger: 0.08,
        delay: 0.35,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    },
    [],
    rootRef,
  );

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label="Meeting type"
      className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]"
    >
      {types.map((t) => {
        const active = t.slug === selected;
        return (
          <div key={t.slug} data-anim="type">
            <button
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onSelect(t.slug)}
              className="tile focus-ring group relative flex h-full w-full flex-col overflow-hidden p-5 text-left sm:p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <p className="text-lg font-semibold leading-snug text-ink">{t.name}</p>
                <span
                  aria-hidden
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                    active ? 'border-brand bg-brand text-white' : 'border-hairline text-transparent'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={3} />
                </span>
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">{t.description}</p>
              <div className="mt-6 flex items-end justify-between gap-3">
                <p className="font-display text-5xl leading-none text-ink">
                  {t.durationMinutes}
                  <span className="ml-1.5 font-sans text-sm font-medium text-muted">min</span>
                </p>
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  <Video className="h-3.5 w-3.5" /> {location}
                </span>
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
