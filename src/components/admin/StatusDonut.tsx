'use client';

import { useState } from 'react';
import { SERIES, type ActivityData } from './ActivityChart';

const SIZE = 180;
const R = 70;
const STROKE = 22;
const C = 2 * Math.PI * R;
const GAP = 3; // px of surface between segments

/** Share of confirmed / cancelled / rescheduled meetings in the chart's current period. */
export function StatusDonut({ data }: { data: ActivityData | null }) {
  const [hover, setHover] = useState<string | null>(null);
  const totals = data?.totals ?? { confirmed: 0, cancelled: 0, rescheduled: 0 };
  const sum = SERIES.reduce((n, s) => n + totals[s.key], 0);
  const segments = SERIES.filter((s) => totals[s.key] > 0);

  let offset = 0;
  const arcs = segments.map((s) => {
    const len = (totals[s.key] / sum) * C;
    const arc = {
      ...s,
      value: totals[s.key],
      dash: Math.max(len - (segments.length > 1 ? GAP : 0), 0.5),
      offset,
    };
    offset += len;
    return arc;
  });
  const focus = arcs.find((a) => a.key === hover);

  return (
    <section className="panel p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-ink">Status mix</h2>
      <p className="mt-1 text-sm text-muted">{data?.title ?? '…'}</p>
      <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row lg:flex-col 2xl:flex-row">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="h-full w-full -rotate-90"
            role="img"
            aria-label="Status mix"
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              stroke="var(--g-line)"
              strokeWidth={STROKE}
            />
            {arcs.map((a) => (
              <circle
                key={a.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={a.color}
                strokeWidth={hover === a.key ? STROKE + 6 : STROKE}
                strokeDasharray={`${a.dash} ${C - a.dash}`}
                strokeDashoffset={-a.offset}
                className="cursor-pointer transition-[stroke-width,opacity] duration-200"
                opacity={hover && hover !== a.key ? 0.35 : 1}
                onMouseEnter={() => setHover(a.key)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display text-5xl leading-none text-ink tabular-nums">
              {focus ? focus.value : sum}
            </span>
            <span className="mt-1 text-xs text-muted">{focus ? focus.label : 'meetings'}</span>
          </div>
        </div>
        <ul className="w-full space-y-2">
          {SERIES.map((s) => {
            const v = totals[s.key];
            const pct = sum ? Math.round((v / sum) * 100) : 0;
            return (
              <li
                key={s.key}
                onMouseEnter={() => setHover(v ? s.key : null)}
                onMouseLeave={() => setHover(null)}
                className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                  hover === s.key ? 'bg-brand-soft' : ''
                }`}
              >
                <span className="inline-flex items-center gap-2 text-ink-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="tabular-nums text-ink">
                  <span className="font-semibold">{v}</span>
                  <span className="ml-2 text-muted">{pct}%</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Confirmed meetings per meeting type in the chart's current period. */
export function TypeBreakdown({ data }: { data: ActivityData | null }) {
  const rows = data?.byType ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="panel p-5 sm:p-7">
      <h2 className="text-lg font-semibold text-ink">By meeting type</h2>
      <p className="mt-1 text-sm text-muted">Confirmed, {data?.title ?? '…'}</p>
      {rows.length === 0 ? (
        <p className="mt-5 text-sm text-muted">No confirmed meetings in this period.</p>
      ) : (
        <ul className="mt-5 space-y-4">
          {rows.map((r) => (
            <li key={r.slug}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate text-ink">{r.name}</span>
                <span className="font-semibold tabular-nums text-ink">{r.count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[var(--g-line)]">
                <div
                  className="h-full rounded-full bg-[var(--viz-confirmed)] transition-[width] duration-500"
                  style={{ width: `${(r.count / max) * 100}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
