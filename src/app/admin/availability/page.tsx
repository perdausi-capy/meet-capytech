'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarOff, CalendarPlus, Copy, Loader2, Plus, Sparkles, Trash2, X } from 'lucide-react';
import {
  api,
  Badge,
  Field,
  PageHeader,
  Panel,
  Segmented,
  Sheet,
  Switch,
  useToast,
} from '@/components/admin/ui';
import { TimezoneSelect } from '@/components/booking/TimezoneSelect';
import {
  availabilityRulesSchema,
  dayWindows,
  overrideInputSchema,
  type AvailabilityRules,
} from '@/lib/availability-schema';

type Day = keyof AvailabilityRules['workingHours'];
type Window = { start: string; end: string };

interface Override {
  date: string;
  kind: 'closed' | 'custom';
  windows: Window[];
  note: string | null;
}

interface AvailabilityResponse {
  rules: AvailabilityRules;
  overrides: Override[];
  bankHolidays: { date: string; title: string }[];
}

const DAYS: { key: Day; label: string; short: string }[] = [
  { key: 'monday', label: 'Monday', short: 'Mon' },
  { key: 'tuesday', label: 'Tuesday', short: 'Tue' },
  { key: 'wednesday', label: 'Wednesday', short: 'Wed' },
  { key: 'thursday', label: 'Thursday', short: 'Thu' },
  { key: 'friday', label: 'Friday', short: 'Fri' },
  { key: 'saturday', label: 'Saturday', short: 'Sat' },
  { key: 'sunday', label: 'Sunday', short: 'Sun' },
];
const WEEKDAYS: Day[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

const toMinutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const fmtDate = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
const dayError = (windows: Window[]) => {
  const r = dayWindows.safeParse(windows);
  return r.success ? '' : (r.error.issues[0]?.message ?? 'Check these times');
};

/* ---------------- Week at a glance ---------------- */

function WeekTimeline({ hours }: { hours: AvailabilityRules['workingHours'] }) {
  const total = DAYS.reduce(
    (n, d) =>
      n + hours[d.key].reduce((m, w) => m + Math.max(0, toMinutes(w.end) - toMinutes(w.start)), 0),
    0,
  );
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <p className="text-sm font-medium text-ink">Week at a glance</p>
        <p className="text-sm text-muted">
          <span className="font-semibold tabular-nums text-ink">
            {Math.round((total / 60) * 10) / 10}
          </span>{' '}
          hours bookable per week
        </p>
      </div>
      <div className="space-y-1.5" role="img" aria-label="Weekly bookable hours">
        {DAYS.map((d) => (
          <div key={d.key} className="flex items-center gap-3">
            <span className="w-9 shrink-0 text-xs font-medium text-muted">{d.short}</span>
            <div className="relative h-5 flex-1 rounded-md bg-[var(--g-line)]">
              {hours[d.key].map((w, i) => (
                <span
                  key={i}
                  className="absolute inset-y-0 rounded-md bg-[var(--viz-confirmed)]"
                  style={{
                    left: `${(toMinutes(w.start) / 1440) * 100}%`,
                    width: `${(Math.max(0, toMinutes(w.end) - toMinutes(w.start)) / 1440) * 100}%`,
                  }}
                  title={`${d.label} ${w.start}–${w.end}`}
                />
              ))}
            </div>
          </div>
        ))}
        <div className="flex gap-3 pt-1">
          <span className="w-9 shrink-0" />
          <div className="flex flex-1 justify-between text-[0.7rem] tabular-nums text-muted">
            {['00:00', '06:00', '12:00', '18:00', '24:00'].map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Windows editor ---------------- */

function WindowsEditor({
  windows,
  onChange,
  idPrefix,
  extra,
}: {
  windows: Window[];
  onChange: (w: Window[]) => void;
  idPrefix: string;
  /** Another action shown beside “Add time range”. */
  extra?: React.ReactNode;
}) {
  const set = (i: number, key: keyof Window, value: string) =>
    onChange(windows.map((w, j) => (j === i ? { ...w, [key]: value } : w)));
  return (
    <div className="flex flex-col gap-2">
      {windows.map((w, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="time"
            step={900}
            aria-label="From"
            id={`${idPrefix}-${i}-start`}
            className="field w-36 py-2 tabular-nums"
            value={w.start}
            onChange={(e) => set(i, 'start', e.target.value)}
          />
          <span className="text-muted">–</span>
          <input
            type="time"
            step={900}
            aria-label="To"
            className="field w-36 py-2 tabular-nums"
            value={w.end}
            onChange={(e) => set(i, 'end', e.target.value)}
          />
          <button
            type="button"
            onClick={() => onChange(windows.filter((_, j) => j !== i))}
            aria-label="Remove this time range"
            className="icon-btn focus-ring h-9 w-9 shrink-0 hover:!border-danger hover:!text-danger"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {windows.length < 6 && (
          <button
            type="button"
            onClick={() => {
              const last = windows[windows.length - 1];
              const startMin = last ? Math.min(toMinutes(last.end) + 60, 22 * 60) : 9 * 60;
              const pad = (m: number) =>
                `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
              onChange([
                ...windows,
                { start: pad(startMin), end: pad(Math.min(startMin + 120, 23 * 60 + 45)) },
              ]);
            }}
            className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-lg text-sm font-medium text-brand hover:underline"
          >
            <Plus className="h-4 w-4" /> Add time range
          </button>
        )}
        {extra}
      </div>
    </div>
  );
}

/* ---------------- Preview ---------------- */

function GuestPreview({
  timezone,
  maxDays,
  version,
}: {
  timezone: string;
  maxDays: number;
  version: number;
}) {
  const [types, setTypes] = useState<{ slug: string; name: string }[]>([]);
  const [type, setType] = useState('');
  const [counts, setCounts] = useState<{ date: string; n: number }[] | null>(null);

  useEffect(() => {
    api<{ meetingTypes: { slug: string; name: string }[] }>('/api/config').then((c) => {
      setTypes(c.meetingTypes);
      setType((t) => t || c.meetingTypes[0]?.slug || '');
    });
  }, []);

  useEffect(() => {
    if (!type) return;
    setCounts(null);
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    const dates = Array.from({ length: Math.min(14, maxDays + 1) }, (_, i) => {
      const d = new Date(`${today}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    });
    const months = [...new Set(dates.map((d) => d.slice(0, 7)))];
    Promise.all(
      months.map((m) =>
        api<{ days: Record<string, unknown[]> }>(
          `/api/availability?type=${encodeURIComponent(type)}&month=${m}&tz=${encodeURIComponent(timezone)}`,
        ),
      ),
    )
      .then((res) => {
        const days = Object.assign({}, ...res.map((r) => r.days)) as Record<string, unknown[]>;
        setCounts(dates.map((d) => ({ date: d, n: days[d]?.length ?? 0 })));
      })
      .catch(() => setCounts([]));
  }, [type, timezone, maxDays, version]);

  const max = Math.max(1, ...(counts ?? []).map((c) => c.n));

  return (
    <Panel
      title="What guests will see"
      description="Free start times over the next two weeks, after your calendars and existing bookings."
      actions={
        types.length > 1 ? (
          <select
            className="field w-auto py-2 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
            aria-label="Meeting type"
          >
            {types.map((t) => (
              <option key={t.slug} value={t.slug}>
                {t.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    >
      {!counts ? (
        <div className="skeleton h-36 rounded-2xl" />
      ) : counts.length === 0 ? (
        <p className="text-sm text-muted">
          Couldn’t load availability (is a calendar unreachable?).
        </p>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {counts.map((c) => {
            const d = new Date(`${c.date}T12:00:00Z`);
            return (
              <div
                key={c.date}
                className={`flex flex-col items-center rounded-xl border px-1 py-2.5 text-center ${
                  c.n ? 'border-hairline bg-card-solid' : 'border-dashed border-hairline opacity-60'
                }`}
                title={`${fmtDate(c.date)}: ${c.n} free start times`}
              >
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider text-muted">
                  {d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}
                </span>
                <span className="text-sm font-semibold text-ink">{d.getUTCDate()}</span>
                <span className="mt-1.5 h-10 w-2 overflow-hidden rounded-full bg-[var(--g-line)]">
                  <span
                    className="block w-full rounded-full bg-[var(--viz-confirmed)]"
                    style={{
                      height: `${(c.n / max) * 100}%`,
                      marginTop: `${100 - (c.n / max) * 100}%`,
                    }}
                  />
                </span>
                <span className="mt-1 text-xs font-semibold tabular-nums text-ink">{c.n}</span>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

/* ---------------- Override sheet ---------------- */

function OverrideSheet({
  initial,
  onClose,
  onSaved,
}: {
  initial: { from: string; to: string; kind: 'closed' | 'custom'; note: string | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [v, setV] = useState({
    ...initial,
    windows: [{ start: '10:00', end: '14:00' }] as Window[],
  });
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const check = overrideInputSchema.safeParse({
    ...v,
    windows: v.kind === 'custom' ? v.windows : [],
  });
  const errs = touched && !check.success ? check.error.flatten().fieldErrors : {};

  const save = async () => {
    setTouched(true);
    if (!check.success) return;
    setBusy(true);
    try {
      const r = await api<{ saved: number }>('/api/admin/availability/overrides', {
        method: 'POST',
        body: JSON.stringify(check.data),
      });
      toast('success', `Saved for ${r.saved} day${r.saved === 1 ? '' : 's'}.`);
      onSaved();
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title="Change specific dates"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-secondary focus-ring">
            Cancel
          </button>
          <button type="button" onClick={save} disabled={busy} className="btn-primary focus-ring">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
          </button>
        </div>
      }
    >
      <div className="grid gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" htmlFor="ov-from" error={errs.from?.[0]}>
            <input
              id="ov-from"
              type="date"
              className="field"
              value={v.from}
              onChange={(e) =>
                setV({
                  ...v,
                  from: e.target.value,
                  to: v.to < e.target.value ? e.target.value : v.to,
                })
              }
            />
          </Field>
          <Field
            label="To"
            htmlFor="ov-to"
            error={errs.to?.[0]}
            hint="Same as “From” for a single day."
          >
            <input
              id="ov-to"
              type="date"
              className="field"
              value={v.to}
              min={v.from}
              onChange={(e) => setV({ ...v, to: e.target.value })}
            />
          </Field>
        </div>
        <Field label="On these dates">
          <Segmented
            label="Override kind"
            value={v.kind}
            onChange={(kind) => setV({ ...v, kind })}
            options={[
              { value: 'closed', label: 'Closed all day' },
              { value: 'custom', label: 'Special hours' },
            ]}
          />
        </Field>
        {v.kind === 'custom' && (
          <Field label="Hours" error={errs.windows?.[0] || (touched ? dayError(v.windows) : '')}>
            <WindowsEditor
              windows={v.windows}
              onChange={(windows) => setV({ ...v, windows })}
              idPrefix="ov"
            />
          </Field>
        )}
        <Field
          label="Note"
          htmlFor="ov-note"
          optional
          hint="Only you see this, e.g. “Conference in Dubai”."
        >
          <input
            id="ov-note"
            className="field"
            maxLength={120}
            value={v.note ?? ''}
            onChange={(e) => setV({ ...v, note: e.target.value || null })}
          />
        </Field>
      </div>
    </Sheet>
  );
}

/* ---------------- Page ---------------- */

export default function AvailabilityPage() {
  const toast = useToast();
  const [data, setData] = useState<AvailabilityResponse | null>(null);
  const [rules, setRules] = useState<AvailabilityRules | null>(null);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState<{
    from: string;
    to: string;
    kind: 'closed' | 'custom';
    note: string | null;
  } | null>(null);
  const [previewVersion, setPreviewVersion] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api<AvailabilityResponse>('/api/admin/availability');
      setData(r);
      setRules(r.rules);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not load availability.');
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const dirty = useMemo(() => JSON.stringify(rules) !== JSON.stringify(data?.rules), [rules, data]);
  const validity = rules ? availabilityRulesSchema.safeParse(rules) : null;

  if (!rules || !data) {
    return <div className="skeleton h-[600px] rounded-[1.75rem]" aria-busy="true" />;
  }

  const setDay = (day: Day, windows: Window[]) =>
    setRules({ ...rules, workingHours: { ...rules.workingHours, [day]: windows } });

  const copyToWeekdays = (day: Day) => {
    const src = rules.workingHours[day];
    const next = { ...rules.workingHours };
    for (const d of WEEKDAYS) next[d] = src.map((w) => ({ ...w }));
    setRules({ ...rules, workingHours: next });
    toast('success', 'Copied to Monday–Friday. Remember to save.');
  };

  const save = async () => {
    if (!validity?.success) return toast('error', 'Please fix the highlighted times first.');
    setSaving(true);
    try {
      const r = await api<{ rules: AvailabilityRules }>('/api/admin/availability', {
        method: 'PUT',
        body: JSON.stringify(rules),
      });
      setData({ ...data, rules: r.rules });
      setRules(r.rules);
      setPreviewVersion((v) => v + 1);
      toast('success', 'Availability saved. Guests see the new times straight away.');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  const removeOverride = async (date: string) => {
    try {
      await api(`/api/admin/availability/overrides/${date}`, { method: 'DELETE' });
      toast('success', `${fmtDate(date)} is back to your weekly hours.`);
      await load();
      setPreviewVersion((v) => v + 1);
    } catch (e) {
      toast('error', e instanceof Error ? e.message : 'Could not remove.');
    }
  };

  const overriddenDates = new Set(data.overrides.map((o) => o.date));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: rules.timezone }).format(new Date());

  return (
    <>
      <PageHeader
        eyebrow="Availability"
        title={
          <>
            When you’re <em className="text-brand">available.</em>
          </>
        }
        description="Guests are only offered times inside these hours that are also free in your calendars."
        actions={
          <button
            type="button"
            onClick={() => setSheet({ from: today, to: today, kind: 'closed', note: null })}
            className="btn-secondary focus-ring"
          >
            <CalendarOff className="h-4 w-4" /> Block out dates
          </button>
        }
      />

      <div className="grid gap-6 pb-24 xl:grid-cols-12">
        {/* Weekly hours */}
        <div className="min-w-0 xl:col-span-7">
          <Panel
            title="Weekly hours"
            description="Your normal week. Add more than one range for split days (e.g. a lunch break)."
          >
            <WeekTimeline hours={rules.workingHours} />
            <ul className="mt-6 divide-y divide-[var(--g-line)]">
              {DAYS.map((d) => {
                const windows = rules.workingHours[d.key];
                const on = windows.length > 0;
                const err = dayError(windows);
                return (
                  <li key={d.key} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start">
                    <div className="flex w-44 shrink-0 items-center gap-3 pt-1.5">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={`${d.label} available`}
                        onClick={() => setDay(d.key, on ? [] : [{ start: '09:00', end: '17:00' }])}
                        className={`focus-ring relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-brand' : 'bg-hairline'}`}
                      >
                        <span
                          aria-hidden
                          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`}
                        />
                      </button>
                      <span className={`text-sm font-semibold ${on ? 'text-ink' : 'text-muted'}`}>
                        {d.label}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      {on ? (
                        <>
                          <WindowsEditor
                            windows={windows}
                            onChange={(w) => setDay(d.key, w)}
                            idPrefix={d.key}
                            extra={
                              <button
                                type="button"
                                onClick={() => copyToWeekdays(d.key)}
                                className="focus-ring inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-muted hover:text-brand"
                              >
                                <Copy className="h-3.5 w-3.5" /> Copy to weekdays
                              </button>
                            }
                          />
                          {err && <p className="mt-1.5 text-xs font-medium text-danger">{err}</p>}
                        </>
                      ) : (
                        <p className="pt-2 text-sm text-muted">Unavailable</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Panel>
        </div>

        {/* Rules + preview */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-6 xl:col-span-5">
          <Panel title="Booking rules">
            <div className="grid gap-6">
              <Field
                label="Your time zone"
                hint="Hours above are in this zone. Guests see times in their own."
              >
                <TimezoneSelect
                  value={rules.timezone}
                  onChange={(timezone) => setRules({ ...rules, timezone })}
                />
              </Field>
              <Field
                label="Minimum notice"
                hint="How soon before a meeting guests can still book it."
              >
                <Segmented
                  label="Minimum notice"
                  value={rules.minNoticeHours}
                  onChange={(minNoticeHours) => setRules({ ...rules, minNoticeHours })}
                  options={[1, 4, 12, 24, 48].map((h) => ({
                    value: h,
                    label: h < 24 ? `${h} h` : `${h / 24} day${h > 24 ? 's' : ''}`,
                  }))}
                />
              </Field>
              <Field label="Booking window" hint="How far ahead guests can book.">
                <Segmented
                  label="Booking window"
                  value={rules.maxAdvanceDays}
                  onChange={(maxAdvanceDays) => setRules({ ...rules, maxAdvanceDays })}
                  options={[14, 30, 60, 90].map((d) => ({ value: d, label: `${d} days` }))}
                />
              </Field>
              <Field
                label="Offer start times every"
                hint="E.g. every 15 minutes: 9:00, 9:15, 9:30…"
              >
                <Segmented
                  label="Start time step"
                  value={rules.slotIntervalMinutes}
                  onChange={(slotIntervalMinutes) => setRules({ ...rules, slotIntervalMinutes })}
                  options={[15, 30, 60].map((m) => ({ value: m, label: `${m} min` }))}
                />
              </Field>
              <div className="rounded-2xl border border-hairline p-4">
                <Switch
                  label="Limit meetings per day"
                  description="Once a day has this many bookings (all types), it’s hidden from guests."
                  checked={rules.maxMeetingsPerDay !== null}
                  onChange={(on) => setRules({ ...rules, maxMeetingsPerDay: on ? 6 : null })}
                />
                {rules.maxMeetingsPerDay !== null && (
                  <div className="mt-3 flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={50}
                      className="field w-24 py-2"
                      value={rules.maxMeetingsPerDay}
                      onChange={(e) =>
                        setRules({ ...rules, maxMeetingsPerDay: Number(e.target.value) })
                      }
                      aria-label="Maximum meetings per day"
                    />
                    <span className="text-sm text-muted">meetings a day</span>
                  </div>
                )}
              </div>
            </div>
          </Panel>
          <GuestPreview
            timezone={rules.timezone}
            maxDays={rules.maxAdvanceDays}
            version={previewVersion}
          />
        </div>

        {/* Date overrides */}
        <div className="min-w-0 xl:col-span-7">
          <Panel
            title="Date overrides"
            description="Days off, holidays or special hours. These replace your weekly hours on those dates."
            actions={
              <button
                type="button"
                onClick={() => setSheet({ from: today, to: today, kind: 'closed', note: null })}
                className="btn-secondary focus-ring px-3 py-2 text-sm"
              >
                <CalendarPlus className="h-4 w-4" /> Add
              </button>
            }
          >
            {data.overrides.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-muted">
                No upcoming changes. Your weekly hours apply every day.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--g-line)]">
                {data.overrides.map((o) => (
                  <li key={o.date} className="flex items-center gap-4 py-3">
                    <span className="w-36 shrink-0 text-sm font-semibold text-ink">
                      {fmtDate(o.date)}
                    </span>
                    <div className="min-w-0 flex-1">
                      {o.kind === 'closed' ? (
                        <Badge tone="warning">Closed</Badge>
                      ) : (
                        <span className="text-sm tabular-nums text-ink-2">
                          {o.windows.map((w) => `${w.start}–${w.end}`).join(', ')}
                        </span>
                      )}
                      {o.note && <span className="ml-2 text-sm text-muted">{o.note}</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeOverride(o.date)}
                      aria-label={`Remove the change on ${fmtDate(o.date)}`}
                      className="icon-btn focus-ring h-9 w-9 hover:!border-danger hover:!text-danger"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Bank holidays */}
        <div className="min-w-0 xl:col-span-5">
          <Panel
            title="UK bank holidays"
            description="Closed automatically. Open one with special hours if you want to work."
          >
            {data.bankHolidays.length === 0 ? (
              <p className="text-sm text-muted">None inside your booking window.</p>
            ) : (
              <ul className="divide-y divide-[var(--g-line)]">
                {data.bankHolidays.map((h) => (
                  <li key={h.date} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{h.title}</p>
                      <p className="text-xs text-muted">{fmtDate(h.date)}</p>
                    </div>
                    {overriddenDates.has(h.date) ? (
                      <Badge tone="brand">Opened</Badge>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setSheet({ from: h.date, to: h.date, kind: 'custom', note: h.title })
                        }
                        className="btn-secondary focus-ring shrink-0 px-3 py-1.5 text-xs"
                      >
                        <Sparkles className="h-3.5 w-3.5" /> Open
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      {/* Sticky save bar */}
      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-card-solid px-4 py-3 shadow-2xl lg:left-[264px]">
          <div className="flex flex-wrap items-center justify-between gap-3 sm:px-4 lg:px-6">
            <p className="text-sm font-medium text-ink">
              You have unsaved changes
              {!validity?.success && (
                <span className="ml-2 text-danger">· some times need fixing</span>
              )}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRules(data.rules)}
                className="btn-secondary focus-ring"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={save}
                disabled={saving}
                className="btn-primary focus-ring"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet && (
        <OverrideSheet
          initial={sheet}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            void load();
            setPreviewVersion((v) => v + 1);
          }}
        />
      )}
    </>
  );
}
