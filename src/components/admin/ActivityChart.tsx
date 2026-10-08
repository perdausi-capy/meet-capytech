'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { ChevronLeft, ChevronRight, Maximize2, Table2, X, LineChart } from 'lucide-react';
import { api, Segmented } from './ui';

export type ActivityView = 'day' | 'month' | 'year';
type Status = 'confirmed' | 'rescheduled' | 'cancelled';

export interface ActivityData {
  view: ActivityView;
  start: string;
  title: string;
  buckets: {
    key: number;
    label: string;
    confirmed: number;
    rescheduled: number;
    cancelled: number;
  }[];
  totals: Record<Status, number>;
  byType: { slug: string; name: string; count: number }[];
}

/** Fixed series order and colours (validated palette, see globals.css). */
export const SERIES: { key: Status; label: string; color: string }[] = [
  { key: 'confirmed', label: 'Confirmed', color: 'var(--viz-confirmed)' },
  { key: 'cancelled', label: 'Cancelled', color: 'var(--viz-cancelled)' },
  { key: 'rescheduled', label: 'Rescheduled', color: 'var(--viz-rescheduled)' },
];

function shift(date: string, view: ActivityView, delta: number) {
  const d = new Date(`${date}T12:00:00Z`);
  if (view === 'day') d.setUTCDate(d.getUTCDate() + delta);
  if (view === 'month') d.setUTCMonth(d.getUTCMonth() + delta, 1);
  if (view === 'year') d.setUTCFullYear(d.getUTCFullYear() + delta, 0, 1);
  return d.toISOString().slice(0, 10);
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey: Status; value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[150px] rounded-xl border border-hairline bg-card-solid px-3 py-2.5 text-xs shadow-lg">
      <p className="mb-1.5 font-semibold text-ink">{label}</p>
      {SERIES.filter((s) => payload.some((p) => p.dataKey === s.key)).map((s) => (
        <p key={s.key} className="flex items-center justify-between gap-4 py-0.5 text-ink-2">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
          <span className="font-semibold tabular-nums text-ink">
            {payload.find((p) => p.dataKey === s.key)?.value ?? 0}
          </span>
        </p>
      ))}
    </div>
  );
}

function Plot({
  data,
  visible,
  height,
}: {
  data: ActivityData;
  visible: Set<Status>;
  height: string;
}) {
  return (
    <div className={height}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data.buckets} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
          <defs>
            {SERIES.map((s) => (
              <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid vertical={false} stroke="var(--g-line)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            minTickGap={18}
            tick={{ fill: 'var(--g-muted)', fontSize: 11 }}
            dy={6}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: 'var(--g-muted)', fontSize: 11 }}
          />
          <Tooltip
            content={<ChartTooltip />}
            cursor={{ stroke: 'var(--g-muted)', strokeWidth: 1, strokeDasharray: '4 4' }}
          />
          {/* Drawn back-to-front so confirmed (the main series) sits on top. */}
          {[...SERIES]
            .reverse()
            .map((s) =>
              visible.has(s.key) ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  fill={`url(#fill-${s.key})`}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--g-card-solid)', fill: s.color }}
                  isAnimationActive
                  animationDuration={600}
                />
              ) : null,
            )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function DataTable({ data, visible }: { data: ActivityData; visible: Set<Status> }) {
  const shown = SERIES.filter((s) => visible.has(s.key));
  return (
    <div className="max-h-80 overflow-auto thin-scroll">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-card-solid">
          <tr className="text-left text-xs uppercase tracking-wider text-muted">
            <th className="py-2 font-semibold">
              {data.view === 'day' ? 'Hour' : data.view === 'month' ? 'Day' : 'Month'}
            </th>
            {shown.map((s) => (
              <th key={s.key} className="py-2 text-right font-semibold">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--g-line)]">
          {data.buckets.map((b) => (
            <tr key={b.key}>
              <td className="py-1.5 text-ink">{b.label}</td>
              {shown.map((s) => (
                <td key={s.key} className="py-1.5 text-right tabular-nums text-ink-2">
                  {b[s.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Meetings over time (by start time). Controls: Day / Month / Year, previous / next / today,
 * per-series toggles, table view and a full-screen mode. Reports the loaded period upwards so
 * the status mix and type breakdown can follow it.
 */
export function ActivityChart({
  today,
  onData,
}: {
  today: string;
  onData?: (data: ActivityData) => void;
}) {
  const [view, setView] = useState<ActivityView>('month');
  const [date, setDate] = useState(today);
  const [data, setData] = useState<ActivityData | null>(null);
  const [visible, setVisible] = useState<Set<Status>>(
    new Set(['confirmed', 'cancelled', 'rescheduled']),
  );
  const [asTable, setAsTable] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<ActivityData>(`/api/admin/activity?view=${view}&date=${date}`)
      .then((d) => {
        if (!active) return;
        setData(d);
        setError('');
        onData?.(d);
      })
      .catch((e: Error) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, [view, date, onData]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expanded]);

  const toggle = (key: Status) =>
    setVisible((prev) => {
      const next = new Set(prev);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });

  const total = useMemo(
    () =>
      data
        ? SERIES.filter((s) => visible.has(s.key)).reduce((n, s) => n + data.totals[s.key], 0)
        : 0,
    [data, visible],
  );

  const controls = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Period"
          value={view}
          onChange={(v) => {
            setView(v);
            setDate(today);
          }}
          options={[
            { value: 'day', label: 'Day' },
            { value: 'month', label: 'Month' },
            { value: 'year', label: 'Year' },
          ]}
        />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setDate(shift(date, view, -1))}
            aria-label="Previous period"
            className="icon-btn focus-ring h-9 w-9"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[9.5rem] text-center text-sm font-semibold text-ink">
            {data?.title ?? '…'}
          </span>
          <button
            type="button"
            onClick={() => setDate(shift(date, view, 1))}
            aria-label="Next period"
            className="icon-btn focus-ring h-9 w-9"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {date !== today && (
            <button
              type="button"
              onClick={() => setDate(today)}
              className="ml-1 text-sm font-medium text-brand hover:underline"
            >
              Today
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="btn-secondary focus-ring px-3 py-2 text-sm"
        >
          {asTable ? <LineChart className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
          {asTable ? 'Chart' : 'Table'}
        </button>
        {!expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            aria-label="Expand chart"
            className="icon-btn focus-ring"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );

  // Legend doubles as the series toggles; always labelled, with each series' total.
  const legend = (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Series">
      {SERIES.map((s) => {
        const on = visible.has(s.key);
        return (
          <button
            key={s.key}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(s.key)}
            className={`focus-ring inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              on
                ? 'border-hairline bg-card-solid text-ink'
                : 'border-dashed border-hairline text-muted'
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{
                background: on ? s.color : 'transparent',
                boxShadow: `inset 0 0 0 2px ${s.color}`,
              }}
            />
            {s.label}
            <span className="font-semibold tabular-nums">{data?.totals[s.key] ?? 0}</span>
          </button>
        );
      })}
    </div>
  );

  const body = error ? (
    <p className="py-10 text-center text-sm text-danger">{error}</p>
  ) : !data ? (
    <div className="skeleton h-72 rounded-2xl" />
  ) : asTable ? (
    <DataTable data={data} visible={visible} />
  ) : (
    <Plot data={data} visible={visible} height={expanded ? 'h-[60vh]' : 'h-full min-h-72 flex-1'} />
  );

  const header = (
    <div className="mb-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">Meetings over time</h2>
        <p className="text-sm text-muted">
          <span className="font-semibold tabular-nums text-ink">{total}</span> in{' '}
          {data?.title ?? 'this period'}
        </p>
      </div>
      {controls}
      <div className="mt-4">{legend}</div>
    </div>
  );

  return (
    <>
      <section className="panel flex h-full flex-col p-5 sm:p-7">
        {header}
        <div className="flex min-h-72 flex-1 flex-col">{body}</div>
      </section>
      {expanded &&
        typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 font-sans sm:p-8">
            <div
              className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm"
              onClick={() => setExpanded(false)}
              aria-hidden
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Meetings over time"
              className="relative w-full max-w-7xl rounded-[1.75rem] border border-hairline bg-card-solid p-6 shadow-2xl sm:p-8"
            >
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="icon-btn focus-ring absolute right-5 top-5"
              >
                <X className="h-4 w-4" />
              </button>
              {header}
              {body}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
