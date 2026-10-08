'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import { detectTimezone, usePublicConfig } from '@/lib/use-public-config';
import { currentMonth, prefetchMonth, useMonthAvailability } from '@/lib/use-month-availability';
import { formatDateShort, localDate, localePrefers12h } from '@/lib/time-format';
import { GuestShell, SectionHeading } from './GuestShell';
import { Hero } from './Hero';
import { MeetingTypeGrid } from './MeetingTypeGrid';
import { MonthCalendar } from './MonthCalendar';
import { DayPanel } from './DayPanel';
import { BookingSummary, DetailsForm, type GuestDetails } from './DetailsForm';
import { Confirmation } from './Confirmation';
import {
  BookingGuide,
  GuideSuspendProvider,
  GuideToggle,
  useGuidePreference,
  type GuideStep,
} from './Guide';

type Step = 'pick' | 'details' | 'done';

interface BookingResult {
  bookingId: string;
  manageToken: string;
  meetLink?: string;
  email: string;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Preferences are a convenience; ignore storage failures.
  }
}

export function BookingFlow() {
  const { config, error: configError } = usePublicConfig();
  const [timezone, setTimezone] = useState('Europe/London');
  const [hour12, setHour12] = useState(false);
  const [typeSlug, setTypeSlug] = useState<string | null>(null);
  const [month, setMonth] = useState(() => currentMonth('Europe/London'));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('pick');
  const [prefill, setPrefill] = useState<Partial<GuestDetails>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [notice, setNotice] = useState('');
  const [result, setResult] = useState<BookingResult | null>(null);

  // Booking guide: follows the guest's progress; can be skipped or toggled from the header.
  const guide = useGuidePreference();
  const [guideStarted, setGuideStarted] = useState(false);
  const [typeConfirmed, setTypeConfirmed] = useState(false);
  const [guideFinished, setGuideFinished] = useState(false);
  const [guideSuspended, setGuideSuspended] = useState(false);
  const suspendGuide = useCallback((on: boolean) => setGuideSuspended(on), []);
  const stepRef = useRef<HTMLDivElement>(null);

  // Guest preferences and deep-link parameters (?type=intro&name=…&email=…&company=…).
  useEffect(() => {
    const tz = detectTimezone('Europe/London');
    setTimezone(tz);
    setMonth(currentMonth(tz));
    const storedClock = readStored('hour12');
    setHour12(storedClock ? storedClock === '1' : localePrefers12h());
    const params = new URLSearchParams(window.location.search);
    setPrefill({
      name: params.get('name') ?? undefined,
      email: params.get('email') ?? undefined,
      company: params.get('company') ?? undefined,
    });
  }, []);

  // Default to the linked meeting type, or the first one.
  useEffect(() => {
    if (!config || typeSlug) return;
    const wanted = new URLSearchParams(window.location.search).get('type');
    const match = config.meetingTypes.find((t) => t.slug === wanted);
    setTypeSlug(match?.slug ?? config.meetingTypes[0]?.slug ?? null);
  }, [config, typeSlug]);

  // Preload the other meeting types for this month so switching type is instant.
  useEffect(() => {
    if (!config) return;
    for (const t of config.meetingTypes) prefetchMonth(t.slug, month, timezone);
  }, [config, month, timezone]);

  const { days, loading, error, refresh } = useMonthAvailability(
    step === 'pick' ? typeSlug : null,
    month,
    timezone,
  );

  // After (re)loading, drop a selected day/time that's no longer available — e.g. after
  // switching to a longer meeting type. A day that still works stays selected.
  useEffect(() => {
    if (loading || !selectedDate) return;
    const slots = days[selectedDate];
    if (!slots?.length) {
      setSelectedDate(null);
      setSelectedTime(null);
    } else if (selectedTime && !slots.some((s) => s.startsAt === selectedTime)) {
      setSelectedTime(null);
    }
  }, [days, loading, selectedDate, selectedTime]);

  const meetingType = config?.meetingTypes.find((t) => t.slug === typeSlug) ?? null;
  const maxMonth = useMemo(() => {
    const last = new Date(Date.now() + (config?.maxAdvanceDays ?? 60) * 86_400_000);
    return localDate(last, timezone).slice(0, 7);
  }, [config?.maxAdvanceDays, timezone]);

  const ready = Boolean(config && meetingType);

  // First render and every step change: ease the panels in (staggered on the picking step).
  useGsap(
    () => {
      gsap.from(step === 'pick' ? '[data-anim="section"]' : '[data-anim="step"]', {
        y: 32,
        opacity: 0,
        duration: 0.8,
        stagger: 0.12,
        delay: step === 'pick' ? 0.25 : 0,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    },
    [step, ready],
    stepRef,
  );

  const goToStep = (next: Step) => {
    setStep(next);
    requestAnimationFrame(() =>
      stepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };

  const changeTimezone = (tz: string) => {
    setTimezone(tz);
    setSelectedDate(null);
    setSelectedTime(null);
  };

  const changeClock = (value: boolean) => {
    setHour12(value);
    store('hour12', value ? '1' : '0');
  };

  const submit = async (details: GuestDetails) => {
    if (!meetingType || !selectedTime) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingType: meetingType.slug,
          startTime: selectedTime,
          name: details.name,
          email: details.email,
          company: details.company || undefined,
          notes: details.notes,
          turnstileToken: details.turnstileToken,
          timezone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Someone else took it: go back to the times with fresh availability.
        setSelectedTime(null);
        setPrefill(details);
        setNotice('Sorry, that time was just taken. Please pick another one.');
        goToStep('pick');
        refresh();
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
      setResult({ ...data, email: details.email });
      goToStep('done');
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (configError) {
    return (
      <GuestShell>
        <div className="panel p-10 text-center">
          <p className="font-semibold text-ink">We couldn’t load the booking page.</p>
          <p className="mt-1 text-sm text-muted">Please refresh in a moment.</p>
        </div>
      </GuestShell>
    );
  }

  if (!config || !meetingType) {
    return (
      <GuestShell>
        <div
          className="grid gap-10 pt-4 sm:grid-cols-[220px_1fr] lg:grid-cols-[320px_1fr]"
          aria-busy="true"
        >
          <div className="skeleton aspect-[4/5] rounded-[2rem]" />
          <div className="flex flex-col justify-end gap-4">
            <div className="skeleton h-28 w-3/4 rounded-2xl" />
            <div className="skeleton h-6 w-1/2 rounded-xl" />
          </div>
        </div>
        <div className="skeleton h-56 rounded-[1.75rem]" />
      </GuestShell>
    );
  }

  const guideStep: GuideStep | null = (() => {
    if (!guide.enabled || guideFinished) return null;
    const total = 5;
    if (!guideStarted && step === 'pick' && !selectedDate) {
      return {
        id: 'welcome',
        target: null,
        numeral: 'Hi.',
        lead: 'Let’s book your',
        em: 'meeting.',
        body: 'I’ll show you what to do at each step. It takes about a minute, and you can skip me any time.',
        primary: { label: 'Start', onClick: () => setGuideStarted(true) },
      };
    }
    if (step === 'pick') {
      if (!typeConfirmed && !selectedDate) {
        return {
          id: 'type',
          target: 'types',
          numeral: '01',
          progress: { current: 1, total },
          lead: 'Choose a',
          em: 'meeting.',
          body: `“${meetingType.name}” is selected. Tap another card to change it.`,
          primary: { label: 'Next', onClick: () => setTypeConfirmed(true) },
        };
      }
      if (!selectedDate) {
        return {
          id: 'day',
          target: 'calendar',
          numeral: '02',
          progress: { current: 2, total },
          lead: 'Pick a',
          em: 'day.',
          body: 'Blue days have free times — tap one. Grey days are unavailable.',
        };
      }
      if (!selectedTime) {
        return {
          id: 'time',
          target: 'time-button',
          numeral: '03',
          progress: { current: 3, total },
          lead: 'Choose a',
          em: 'time.',
          body: 'Press “Choose a time”, tap an hour with a dot, then the minutes.',
        };
      }
      return {
        id: 'continue',
        target: 'continue',
        numeral: '03',
        progress: { current: 3, total },
        lead: 'Happy with',
        em: 'this time?',
        body: 'Press Continue to add your details — or Change to pick another.',
      };
    }
    if (step === 'details') {
      return {
        id: 'details',
        target: 'details',
        numeral: '04',
        progress: { current: 4, total },
        lead: 'Add your',
        em: 'details.',
        body: 'Your name and email, so we can send the invite. Then press “Confirm booking”.',
      };
    }
    return {
      id: 'done',
      target: null,
      numeral: '05',
      progress: { current: 5, total },
      lead: 'You’re',
      em: 'all set.',
      body: 'Your invite is on its way. Reschedule or cancel any time from the link in it.',
      primary: { label: 'Finish', onClick: () => setGuideFinished(true) },
    };
  })();

  // Earliest free slot in the month being shown, for the hero's one-click card.
  const firstDate = Object.keys(days).sort()[0];
  const nextOpening =
    step === 'pick' && firstDate && days[firstDate]?.[0]
      ? { date: firstDate, startsAt: days[firstDate]![0]!.startsAt }
      : null;

  const summary = selectedTime ? (
    <BookingSummary
      meetingName={meetingType.name}
      durationMinutes={meetingType.durationMinutes}
      location={config.profile.location}
      startsAt={selectedTime}
      timezone={timezone}
      hour12={hour12}
    />
  ) : null;

  return (
    <GuideSuspendProvider value={suspendGuide}>
      <GuestShell
        footer={<>Times are shown in {timezone.replace(/_/g, ' ')}.</>}
        headerActions={
          <GuideToggle
            on={guide.enabled}
            onChange={(on) => {
              guide.setEnabled(on);
              if (on) {
                setGuideFinished(false);
                setGuideStarted(true);
              }
            }}
          />
        }
      >
        <Hero
          profile={config.profile}
          meetingTypes={config.meetingTypes}
          nextOpening={
            nextOpening
              ? {
                  startsAt: nextOpening.startsAt,
                  meetingName: meetingType.name,
                  durationMinutes: meetingType.durationMinutes,
                }
              : null
          }
          timezone={timezone}
          hour12={hour12}
          onBookNext={() => {
            if (!nextOpening) return;
            setSelectedDate(nextOpening.date);
            setSelectedTime(nextOpening.startsAt);
            if (step !== 'pick') setStep('pick');
            requestAnimationFrame(() =>
              document
                .getElementById('time-title')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
            );
          }}
        />

        <div ref={stepRef} className="scroll-mt-6">
          {step === 'pick' && (
            <div data-anim="step" className="flex flex-col gap-6 lg:gap-8">
              {notice && (
                <div
                  role="status"
                  className="rounded-2xl border border-brand bg-brand-soft px-5 py-4 text-sm font-medium text-brand-ink"
                >
                  {notice}
                </div>
              )}

              <section
                data-anim="section"
                data-guide="types"
                aria-labelledby="types-title"
                className="panel p-6 sm:p-8 lg:p-10"
              >
                <SectionHeading
                  index="01"
                  id="types-title"
                  title="Choose a meeting"
                  aside={`${config.meetingTypes.length} option${config.meetingTypes.length === 1 ? '' : 's'}`}
                />
                <MeetingTypeGrid
                  types={config.meetingTypes}
                  selected={typeSlug}
                  onSelect={(slug) => {
                    setTypeSlug(slug);
                    setTypeConfirmed(true);
                  }}
                  location={config.profile.location}
                />
              </section>

              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-8">
                <section
                  data-anim="section"
                  data-guide="calendar"
                  aria-labelledby="day-title"
                  className="panel p-6 sm:p-8 lg:p-10"
                >
                  <SectionHeading index="02" id="day-title" title="Pick a day" />
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
                      setNotice('');
                    }}
                  />
                </section>

                <section
                  data-anim="section"
                  aria-labelledby="time-title"
                  className="panel flex flex-col p-6 sm:p-8 lg:p-10"
                >
                  <SectionHeading
                    index="03"
                    id="time-title"
                    title="Pick a time"
                    aside={selectedDate ? formatDateShort(selectedDate) : undefined}
                  />
                  <DayPanel
                    date={selectedDate}
                    slots={selectedDate ? (days[selectedDate] ?? []) : []}
                    timezone={timezone}
                    onTimezoneChange={changeTimezone}
                    hour12={hour12}
                    onToggleHour12={changeClock}
                    durationMinutes={meetingType.durationMinutes}
                    selectedTime={selectedTime}
                    onSelectTime={setSelectedTime}
                    onContinue={() => {
                      setNotice('');
                      setSubmitError('');
                      goToStep('details');
                    }}
                  />
                </section>
              </div>
            </div>
          )}

          {step === 'details' && summary && (
            <section
              data-anim="step"
              data-guide="details"
              aria-label="Your details"
              className="panel p-6 sm:p-8 lg:p-12"
            >
              <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-14">
                <DetailsForm
                  initial={prefill}
                  siteKey={config.turnstileSiteKey}
                  submitting={submitting}
                  error={submitError}
                  onBack={() => goToStep('pick')}
                  onSubmit={submit}
                />
                <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
                  <p className="font-mono text-sm font-medium text-brand">04 · Review</p>
                  {summary}
                  <button
                    type="button"
                    onClick={() => goToStep('pick')}
                    className="btn-secondary focus-ring"
                  >
                    <ArrowLeft className="h-4 w-4" /> Change time
                  </button>
                </aside>
              </div>
            </section>
          )}

          {step === 'done' && result && selectedTime && (
            <section
              data-anim="step"
              aria-label="Booking confirmed"
              className="panel px-6 py-10 sm:px-10 lg:py-14"
            >
              <Confirmation
                hostName={config.profile.name}
                email={result.email}
                summary={summary}
                bookingId={result.bookingId}
                meetLink={result.meetLink}
                manageUrl={`/manage/${result.manageToken}`}
                calendarEvent={{
                  title: `${meetingType.name} with ${config.profile.name} (${config.profile.company})`,
                  description: [
                    result.meetLink ? `Join: ${result.meetLink}` : '',
                    `Manage your booking: ${window.location.origin}/manage/${result.manageToken}`,
                  ]
                    .filter(Boolean)
                    .join('\n'),
                  startsAt: selectedTime,
                  endsAt: new Date(
                    new Date(selectedTime).getTime() + meetingType.durationMinutes * 60_000,
                  ).toISOString(),
                  location: result.meetLink ?? config.profile.location,
                }}
              />
            </section>
          )}
        </div>
        {guideStep && (
          <BookingGuide
            step={guideStep}
            suspended={guideSuspended}
            onSkip={() => guide.setEnabled(false)}
          />
        )}
      </GuestShell>
    </GuideSuspendProvider>
  );
}
