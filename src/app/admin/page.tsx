'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  ExternalLink,
  Link2,
  Mail,
  Minus,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { api, Badge, PageHeader, Panel } from '@/components/admin/ui';
import { ActivityChart, type ActivityData } from '@/components/admin/ActivityChart';
import { StatusDonut, TypeBreakdown } from '@/components/admin/StatusDonut';

interface Meeting {
  id: string;
  name: string;
  email: string;
  company: string | null;
  typeName: string;
  startsAt: string;
  endsAt: string;
}

interface Overview {
  timezone: string;
  today: Meeting[];
  stats: {
    today: number;
    nextSevenDays: number;
    thisMonth: number;
    lastMonth: number;
    madeLast30: number;
    madePrevious30: number;
    cancelledLast30: number;
    noShowsLast30: number;
  };
  upcoming: Meeting[];
  recent: {
    id: string;
    name: string;
    typeName: string;
    status: 'confirmed' | 'cancelled' | 'rescheduled';
    startsAt: string;
    updatedAt: string;
  }[];
  health: {
    google: { connected: boolean; email: string | null; lastError: string | null };
    email: 'smtp' | 'outbox' | 'disabled';
    turnstile: boolean;
    failedJobs: number;
    lastBackupAt: string | null;
  };
}

const fmtDay = (iso: string, tz: string) =>
  new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: tz,
  });
const fmtTime = (iso: string, tz: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz });
const localDate = (tz: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

/** "in 2h 15m", "in 3 days", "now". */
function until(iso: string, now: number) {
  const mins = Math.round((new Date(iso).getTime() - now) / 60_000);
  if (mins <= 0) return 'now';
  if (mins < 60) return `in ${mins} min`;
  if (mins < 24 * 60)
    return `in ${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ''}`.trim();
  const days = Math.round(mins / (24 * 60));
  return `in ${days} day${days === 1 ? '' : 's'}`;
}

/* ---------------- Pieces ---------------- */

function Delta({ now, before, label }: { now: number; before: number; label: string }) {
  const diff = now - before;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-2">
      <Icon className="h-3.5 w-3.5" />
      <span className="font-semibold tabular-nums">
        {diff > 0 ? '+' : ''}
        {diff}
      </span>{' '}
      {label}
    </span>
  );
}

function Stat({ label, value, foot }: { label: string; value: number; foot: React.ReactNode }) {
  return (
    <div className="panel flex flex-col justify-between p-5">
      <p className="text-sm font-medium text-muted">{label}</p>
      <p className="mt-3 font-display text-[3.25rem] leading-none text-ink tabular-nums">{value}</p>
      <div className="mt-3 text-xs text-muted">{foot}</div>
    </div>
  );
}

function NextUp({ data }: { data: Overview }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const tz = data.timezone;
  const next = data.upcoming[0];

  return (
    <section className="guide-note relative flex h-full flex-col overflow-hidden rounded-[1.75rem] p-6 shadow-card sm:p-8">
      <p className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--guide-muted)]">NEXT UP</p>
      {next ? (
        <>
          <p className="mt-3 font-display text-6xl leading-none text-[var(--guide-accent)] sm:text-7xl">
            {until(next.startsAt, now)}
          </p>
          <p className="mt-4 text-2xl font-semibold">{next.name}</p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--guide-muted)]">
            {next.company && (
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" /> {next.company}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-4 w-4" /> {fmtDay(next.startsAt, tz)},{' '}
              {fmtTime(next.startsAt, tz)}–{fmtTime(next.endsAt, tz)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--guide-muted)]">{next.typeName}</p>
          <a
            href={`mailto:${next.email}`}
            className="mt-5 inline-flex w-fit items-center gap-2 rounded-full border border-[var(--guide-rule)] px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--guide-accent)]"
          >
            <Mail className="h-4 w-4" /> {next.email}
          </a>
        </>
      ) : (
        <p className="mt-3 font-display text-5xl leading-tight">Nothing booked yet.</p>
      )}

      <div className="mt-8 border-t border-[var(--guide-rule)] pt-5">
        <p className="mb-3 font-mono text-[0.7rem] tracking-[0.18em] text-[var(--guide-muted)]">
          TODAY · {data.today.length} MEETING{data.today.length === 1 ? '' : 'S'}
        </p>
        {data.today.length === 0 ? (
          <p className="text-sm text-[var(--guide-muted)]">Your day is clear.</p>
        ) : (
          <ol className="space-y-3">
            {data.today.map((m) => {
              const past = new Date(m.endsAt).getTime() < now;
              const live = !past && new Date(m.startsAt).getTime() <= now;
              return (
                <li key={m.id} className={`flex items-center gap-4 ${past ? 'opacity-45' : ''}`}>
                  <span className="w-12 shrink-0 font-mono text-sm tabular-nums">
                    {fmtTime(m.startsAt, tz)}
                  </span>
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${live ? 'bg-[var(--guide-accent)] shadow-[0_0_0_4px_rgb(147_197_253_/_0.25)]' : 'border border-[var(--guide-muted)]'}`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-[var(--guide-muted)]"> · {m.typeName}</span>
                  </span>
                  {live && (
                    <span className="font-mono text-[0.65rem] tracking-[0.16em] text-[var(--guide-accent)]">
                      NOW
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

function HealthRow({
  ok,
  warn,
  icon: Icon,
  title,
  detail,
  action,
}: {
  ok: boolean;
  warn?: boolean;
  icon: typeof Mail;
  title: string;
  detail: string;
  action?: React.ReactNode;
}) {
  const StatusIcon = ok ? CheckCircle2 : warn ? AlertTriangle : XCircle;
  const tone = ok ? 'text-success' : warn ? 'text-amber-500' : 'text-danger';
  return (
    <li className="flex items-start gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          {title}
          <StatusIcon
            className={`h-4 w-4 ${tone}`}
            aria-label={ok ? 'OK' : warn ? 'Warning' : 'Problem'}
          />
        </p>
        <p className="mt-0.5 break-words text-xs text-muted">{detail}</p>
        {action && <div className="mt-2">{action}</div>}
      </div>
    </li>
  );
}

/* ---------------- Page ---------------- */

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [period, setPeriod] = useState<ActivityData | null>(null);
  const [copied, setCopied] = useState(false);
  const onPeriod = useCallback((d: ActivityData) => setPeriod(d), []);

  useEffect(() => {
    api<Overview>('/api/admin/overview')
      .then(setData)
      .catch((e: Error) => setError(e.message));
    api<{ profile: { name: string } }>('/api/admin/profile')
      .then((r) => setName(r.profile.name))
      .catch(() => {});
  }, []);

  if (error) return <Panel>Couldn’t load the overview: {error}</Panel>;
  if (!data) {
    return (
      <div className="grid gap-6" aria-busy="true">
        <div className="skeleton h-24 rounded-2xl" />
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="skeleton h-96 rounded-[1.75rem] xl:col-span-5" />
          <div className="skeleton h-96 rounded-[1.75rem] xl:col-span-7" />
        </div>
      </div>
    );
  }

  const tz = data.timezone;
  const s = data.stats;
  const h = data.health;
  const todayLabel = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: tz,
  });

  const copyLink = async () => {
    await navigator.clipboard.writeText(window.location.origin).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <>
      <PageHeader
        eyebrow={todayLabel}
        title={
          <>
            {greeting()}
            {name && (
              <>
                , <em className="text-brand">{name}.</em>
              </>
            )}
          </>
        }
        description={`Everything at a glance. Times are shown in ${tz.replace(/_/g, ' ')}.`}
        actions={
          <>
            <button type="button" onClick={copyLink} className="btn-secondary focus-ring">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy booking link'}
            </button>
            <a href="/" target="_blank" rel="noreferrer" className="btn-primary focus-ring">
              <ExternalLink className="h-4 w-4" /> View booking page
            </a>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="min-w-0 xl:col-span-5">
          <NextUp data={data} />
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:col-span-7">
          <Stat label="Today" value={s.today} foot="Confirmed meetings" />
          <Stat label="Next 7 days" value={s.nextSevenDays} foot="Confirmed meetings" />
          <Stat
            label="This month"
            value={s.thisMonth}
            foot={<Delta now={s.thisMonth} before={s.lastMonth} label="vs last month" />}
          />
          <Stat
            label="Booked (30 days)"
            value={s.madeLast30}
            foot={<Delta now={s.madeLast30} before={s.madePrevious30} label="vs previous 30" />}
          />
          <Stat label="Cancelled (30 days)" value={s.cancelledLast30} foot="By guests or by you" />
          <Stat label="No-shows (30 days)" value={s.noShowsLast30} foot="Marked in Bookings" />
        </div>

        <div className="min-w-0 xl:col-span-8">
          <ActivityChart today={localDate(tz)} onData={onPeriod} />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 xl:col-span-4">
          <StatusDonut data={period} />
          <TypeBreakdown data={period} />
        </div>

        <div className="min-w-0 xl:col-span-7 2xl:col-span-5">
          <Panel
            title="Upcoming meetings"
            description="The next confirmed bookings."
            className="h-full"
          >
            {data.upcoming.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-hairline p-6 text-center text-sm text-muted">
                Nothing booked yet. Share your booking page to get started.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--g-line)]">
                {data.upcoming.map((b) => (
                  <li key={b.id} className="flex items-center gap-4 py-3">
                    <div className="w-24 shrink-0">
                      <p className="text-sm font-semibold text-ink">{fmtDay(b.startsAt, tz)}</p>
                      <p className="text-xs tabular-nums text-muted">
                        {fmtTime(b.startsAt, tz)}–{fmtTime(b.endsAt, tz)}
                      </p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        {b.name}
                        {b.company && (
                          <span className="font-normal text-muted"> · {b.company}</span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {b.typeName} · {b.email}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 xl:col-span-5 2xl:col-span-4">
          <Panel
            title="Recent changes"
            description="Latest bookings, moves and cancellations."
            className="h-full"
          >
            {data.recent.length === 0 ? (
              <p className="text-sm text-muted">No activity yet.</p>
            ) : (
              <ul className="divide-y divide-[var(--g-line)]">
                {data.recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{r.name}</p>
                      <p className="truncate text-xs text-muted">
                        {r.typeName} · {fmtDay(r.startsAt, tz)}
                      </p>
                    </div>
                    <Badge
                      tone={
                        r.status === 'confirmed'
                          ? 'success'
                          : r.status === 'cancelled'
                            ? 'danger'
                            : 'neutral'
                      }
                    >
                      {r.status === 'rescheduled'
                        ? 'Moved'
                        : r.status === 'confirmed'
                          ? 'Confirmed'
                          : 'Cancelled'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="min-w-0 xl:col-span-12 2xl:col-span-3">
          <Panel title="System health" className="h-full">
            <ul className="grid gap-x-6 sm:grid-cols-2 xl:grid-cols-5 2xl:grid-cols-1">
              <HealthRow
                ok={h.google.connected && !h.google.lastError}
                warn={h.google.connected && Boolean(h.google.lastError)}
                icon={Link2}
                title="Google Calendar"
                detail={
                  h.google.connected
                    ? h.google.lastError
                      ? `Last check failed: ${h.google.lastError}`
                      : `Connected as ${h.google.email}`
                    : 'Not connected: guests can’t book in production.'
                }
                action={
                  <a
                    href="/api/admin/connect"
                    className="btn-secondary focus-ring shrink-0 px-3 py-1.5 text-xs"
                  >
                    {h.google.connected ? 'Reconnect' : 'Connect'}
                  </a>
                }
              />
              <HealthRow
                ok={h.email === 'smtp'}
                warn={h.email === 'outbox'}
                icon={Mail}
                title="Emails"
                detail={
                  h.email === 'smtp'
                    ? 'Sending through SMTP.'
                    : h.email === 'outbox'
                      ? 'Development: saved to the outbox, not sent.'
                      : 'SMTP not configured: no confirmation emails.'
                }
              />
              <HealthRow
                ok={h.turnstile}
                warn={!h.turnstile}
                icon={ShieldCheck}
                title="Bot protection"
                detail={h.turnstile ? 'Turnstile is on.' : 'Turnstile is off.'}
              />
              <HealthRow
                ok={h.failedJobs === 0}
                icon={RefreshCw}
                title="Background jobs"
                detail={
                  h.failedJobs === 0 ? 'Nothing stuck.' : `${h.failedJobs} failed after retries.`
                }
              />
              <HealthRow
                ok={Boolean(h.lastBackupAt)}
                warn={!h.lastBackupAt}
                icon={Database}
                title="Backups"
                detail={
                  h.lastBackupAt
                    ? `Last: ${new Date(h.lastBackupAt).toLocaleString('en-GB', { timeZone: tz })}`
                    : 'First backup runs tonight at 03:00.'
                }
              />
            </ul>
            <p className="mt-4 text-xs text-muted">
              <Link href="/admin/meeting-types" className="font-medium text-brand hover:underline">
                Manage meeting types →
              </Link>
            </p>
          </Panel>
        </div>
      </div>
    </>
  );
}
