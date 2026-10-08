'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CalendarX2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  XCircle,
} from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import { detectTimezone, usePublicConfig } from '@/lib/use-public-config';
import { currentMonth, useMonthAvailability } from '@/lib/use-month-availability';
import { formatDateShort, localDate, localePrefers12h } from '@/lib/time-format';
import { GuestShell, SectionHeading } from './GuestShell';
import { Portrait } from './Hero';
import { MonthCalendar } from './MonthCalendar';
import { DayPanel } from './DayPanel';
import { TimezoneSelect } from './TimezoneSelect';
import { BookingSummary } from './DetailsForm';

interface ManagedBooking {
  id: string;
  typeSlug: string;
  startsAt: string;
  endsAt: string;
  name: string;
  email: string;
  status: 'pending' | 'confirmed' | 'cancelled' | 'rescheduled';
  canModify: boolean;
}

type Mode = 'view' | 'reschedule' | 'cancel';

const STATUS = {
  confirmed: { label: 'Confirmed', icon: CheckCircle2, cls: 'text-success' },
  pending: { label: 'Pending', icon: Loader2, cls: 'text-muted' },
  cancelled: { label: 'Cancelled', icon: XCircle, cls: 'text-danger' },
  rescheduled: { label: 'Moved to a new time', icon: RefreshCw, cls: 'text-muted' },
} as const;

export function ManageFlow({ initialToken }: { initialToken: string }) {
  const { config } = usePublicConfig();
  const [token, setToken] = useState(initialToken);
  const [booking, setBooking] = useState<ManagedBooking | null>(null);
  const [loadError, setLoadError] = useState('');
  const [mode, setMode] = useState<Mode>('view');
  const [timezone, setTimezone] = useState('Europe/London');
  const [hour12, setHour12] = useState(false);
  const [month, setMonth] = useState(() => currentMonth('Europe/London'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [success, setSuccess] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tz = detectTimezone('Europe/London');
    setTimezone(tz);
    setMonth(currentMonth(tz));
    let stored: string | null = null;
    try {
      stored = localStorage.getItem('hour12');
    } catch {
      stored = null;
    }
    setHour12(stored ? stored === '1' : localePrefers12h());
  }, []);

  const load = useCallback(async (t: string) => {
    setLoadError('');
    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(t)}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Booking not found');
      setBooking(data);
    } catch (err) {
      setBooking(null);
      setLoadError(err instanceof Error ? err.message : 'Booking not found');
    }
  }, []);

  useEffect(() => {
    void load(token);
  }, [token, load]);

  const { days, loading, error, refresh } = useMonthAvailability(
    mode === 'reschedule' && booking ? booking.typeSlug : null,
    month,
    timezone,
  );

  const maxMonth = useMemo(() => {
    const last = new Date(Date.now() + (config?.maxAdvanceDays ?? 60) * 86_400_000);
    return localDate(last, timezone).slice(0, 7);
  }, [config?.maxAdvanceDays, timezone]);

  const ready = Boolean(booking && config);
  useGsap(
    () => {
      gsap.from('[data-anim="m-section"]', {
        y: 30,
        opacity: 0,
        duration: 0.7,
        stagger: 0.1,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    },
    [mode, ready],
    rootRef,
  );

  const setClock = (v: boolean) => {
    setHour12(v);
    try {
      localStorage.setItem('hour12', v ? '1' : '0');
    } catch {
      // ignore
    }
  };

  const doCancel = async () => {
    setBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}/cancel`, {
        method: 'POST',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not cancel. Please try again.');
      setSuccess('Your meeting has been cancelled. A confirmation email is on its way.');
      setMode('view');
      await load(token);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not cancel. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const doReschedule = async () => {
    if (!selectedTime) return;
    setBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/manage/${encodeURIComponent(token)}/reschedule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startTime: selectedTime }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setSelectedTime(null);
        refresh();
        throw new Error(data.error || 'That time was just taken. Please pick another one.');
      }
      if (!res.ok) throw new Error(data.error || 'Could not reschedule. Please try again.');
      setSuccess(
        data.warning
          ? `Your meeting has moved. ${data.warning}`
          : 'Your meeting has moved. An updated invite and confirmation email are on their way.',
      );
      setMode('view');
      setSelectedDate(null);
      setSelectedTime(null);
      // The old link now points at the superseded booking; switch to the new one.
      if (data.manageToken) {
        window.history.replaceState(null, '', `/manage/${data.manageToken}`);
        setToken(data.manageToken);
      }
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Could not reschedule. Please try again.',
      );
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return (
      <GuestShell>
        <section className="panel flex flex-col items-center px-6 py-16 text-center">
          <CalendarX2 className="h-12 w-12 text-muted" />
          <h1 className="mt-5 font-display text-5xl text-ink">We couldn’t find that booking</h1>
          <p className="mt-3 max-w-md text-muted">
            The link may be mistyped or out of date. If you rescheduled, use the link from your most
            recent email.
          </p>
          <Link href="/" className="btn-primary focus-ring mt-8">
            Book a new time
          </Link>
        </section>
      </GuestShell>
    );
  }

  if (!booking || !config) {
    return (
      <GuestShell>
        <div className="skeleton h-[420px] rounded-[1.75rem]" aria-busy="true" />
      </GuestShell>
    );
  }

  const meetingType = config.meetingTypes.find((t) => t.slug === booking.typeSlug);
  const meetingName = meetingType?.name ?? booking.typeSlug;
  const durationMinutes =
    meetingType?.durationMinutes ??
    (new Date(booking.endsAt).getTime() - new Date(booking.startsAt).getTime()) / 60_000;
  const status = STATUS[booking.status];
  const StatusIcon = status.icon;
  const summary = (
    <BookingSummary
      meetingName={meetingName}
      durationMinutes={durationMinutes}
      location={config.profile.location}
      startsAt={booking.startsAt}
      timezone={timezone}
      hour12={hour12}
    />
  );

  return (
    <GuestShell footer={<>Times are shown in {timezone.replace(/_/g, ' ')}.</>}>
      <div ref={rootRef} className="flex flex-col gap-6 lg:gap-8">
        {(success || actionError) && (
          <div
            role={actionError ? 'alert' : 'status'}
            className={`flex items-start gap-2.5 rounded-2xl border px-5 py-4 text-sm font-medium ${
              actionError ? 'border-danger text-danger' : 'border-success text-success'
            }`}
          >
            {actionError ? (
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            )}
            {actionError || success}
          </div>
        )}

        <section data-anim="m-section" className="panel p-6 sm:p-8 lg:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0">
              <p className={`inline-flex items-center gap-1.5 text-sm font-semibold ${status.cls}`}>
                <StatusIcon className="h-4 w-4" /> {status.label}
              </p>
              <h1 className="mt-3 font-display text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.95] text-ink">
                Hi {booking.name.split(' ')[0]}, here’s your meeting with{' '}
                <em className="text-brand">{config.profile.name}.</em>
              </h1>

              {mode !== 'reschedule' && (
                <div className="mt-8 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div className={booking.status === 'confirmed' ? '' : 'opacity-60'}>
                    {summary}
                  </div>
                  <TimezoneSelect value={timezone} onChange={setTimezone} />
                </div>
              )}

              {mode === 'view' && booking.status === 'confirmed' && booking.canModify && (
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setSuccess('');
                      setActionError('');
                      setMode('reschedule');
                    }}
                    className="btn-primary focus-ring"
                  >
                    <RefreshCw className="h-4 w-4" /> Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSuccess('');
                      setActionError('');
                      setMode('cancel');
                    }}
                    className="btn-secondary focus-ring hover:!border-danger hover:!text-danger"
                  >
                    Cancel meeting
                  </button>
                </div>
              )}
              {mode === 'view' && booking.status === 'confirmed' && !booking.canModify && (
                <p className="mt-8 rounded-2xl bg-brand-soft px-5 py-4 text-sm text-brand-ink">
                  This meeting starts soon, so it can no longer be changed online. Please reply to
                  your invite email if something has come up.
                </p>
              )}
              {mode === 'view' && booking.status !== 'confirmed' && (
                <Link href="/" className="btn-primary focus-ring mt-8">
                  Book a new time
                </Link>
              )}
            </div>
            <Portrait profile={config.profile} className="hidden aspect-[4/5] w-full lg:block" />
          </div>
        </section>

        {mode === 'cancel' && (
          <section data-anim="m-section" className="panel p-6 sm:p-8 lg:p-12">
            <div className="mx-auto flex max-w-xl flex-col items-center text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-soft text-danger">
                <AlertTriangle className="h-7 w-7" />
              </span>
              <h2 className="mt-4 font-display text-4xl text-ink">Cancel this meeting?</h2>
              <p className="mt-2 text-muted">
                The invite will be removed from both calendars. You can always book a new time.
              </p>
              <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={() => setMode('view')}
                  disabled={busy}
                  className="btn-secondary focus-ring flex-1"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={doCancel}
                  disabled={busy}
                  className="btn-primary focus-ring flex-1 !bg-danger"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Yes, cancel
                </button>
              </div>
            </div>
          </section>
        )}

        {mode === 'reschedule' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-8">
            <section data-anim="m-section" className="panel p-6 sm:p-8 lg:p-10">
              <SectionHeading
                index="01"
                title="Pick a new day"
                aside={
                  <button
                    type="button"
                    onClick={() => setMode('view')}
                    className="focus-ring inline-flex items-center gap-1 rounded-lg font-medium text-muted hover:text-ink"
                  >
                    <ArrowLeft className="h-4 w-4" /> Keep current time
                  </button>
                }
              />
              <MonthCalendar
                month={month}
                onMonthChange={setMonth}
                maxMonth={maxMonth}
                timezone={timezone}
                days={days}
                loading={loading}
                error={error}
                onRetry={refresh}
                selectedDate={selectedDate}
                onSelectDate={(d) => {
                  setSelectedDate(d);
                  setSelectedTime(null);
                }}
              />
            </section>
            <section data-anim="m-section" className="panel flex flex-col p-6 sm:p-8 lg:p-10">
              <SectionHeading
                index="02"
                title="Pick a new time"
                aside={selectedDate ? formatDateShort(selectedDate) : undefined}
              />
              <DayPanel
                date={selectedDate}
                slots={selectedDate ? (days[selectedDate] ?? []) : []}
                timezone={timezone}
                onTimezoneChange={(tz) => {
                  setTimezone(tz);
                  setSelectedDate(null);
                  setSelectedTime(null);
                }}
                hour12={hour12}
                onToggleHour12={setClock}
                durationMinutes={durationMinutes}
                selectedTime={selectedTime}
                onSelectTime={setSelectedTime}
                onContinue={doReschedule}
                continueLabel={busy ? 'Moving your meeting…' : 'Move my meeting'}
                busy={busy}
              />
            </section>
          </div>
        )}
      </div>
    </GuestShell>
  );
}
