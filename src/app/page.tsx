'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { DateTime } from 'luxon';
import { DayPicker } from '@/components/DayPicker';
import { usePublicConfig, detectTimezone } from '@/lib/use-public-config';
import { SlotList } from '@/components/SlotList';
import { ThemeToggle } from '@/components/ThemeToggle';
import dynamic from 'next/dynamic';
const Canvas3D = dynamic(() => import('@/components/Canvas3D').then((m) => m.Canvas3D), {
  ssr: false,
});
import { ArrowLeft, ExternalLink, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

declare global {
  interface Window {
    onTurnstileSuccess: (token: string) => void;
  }
}

export default function Home() {
  const [meetingType, setMeetingType] = useState<string | null>(null);
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [time, setTime] = useState<string | undefined>(undefined);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [bookingResult, setBookingResult] = useState<{
    bookingId?: string;
    manageToken?: string;
    meetLink?: string;
  } | null>(null);

  const { config, error: configError } = usePublicConfig();
  const hostTimezone = config?.timezone || 'Europe/London';
  const [timezone, setTimezone] = useState('Europe/London');
  const [turnstileToken, setTurnstileToken] = useState<string | undefined>(undefined);
  const siteKey = config?.turnstileSiteKey || null;

  useEffect(() => {
    setTimezone(detectTimezone('Europe/London'));
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    window.onTurnstileSuccess = (token: string) => setTurnstileToken(token);
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    script.async = true;
    document.body.appendChild(script);
  }, [siteKey]);

  const timezoneOptions = useMemo(() => {
    try {
      const zones = Intl.supportedValuesOf('timeZone');
      return zones.includes(timezone) ? zones : [timezone, ...zones];
    } catch {
      return [timezone];
    }
  }, [timezone]);

  // Day-of-week blocking only lines up when the guest shares the host's UTC offset; elsewhere a
  // host weekday can fall on a different local day, so let the slot list decide instead.
  const sameOffsetAsHost =
    DateTime.now().setZone(timezone).offset === DateTime.now().setZone(hostTimezone).offset;

  // The day the guest picked, in their own time zone (the calendar grid is local dates).
  const dateStr = date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    : '';

  const meetingTypesList = (config?.meetingTypes || []).map((t) => ({
    slug: t.slug,
    name: t.name,
    duration: `${t.durationMinutes} MIN`,
    desc: t.description,
  }));

  const currentTypeMeta = meetingTypesList.find((m) => m.slug === meetingType);
  const progressPercentage =
    step === 1 ? 20 : step === 2 ? 40 : step === 3 ? 60 : step === 4 ? 80 : 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meetingType || !dateStr || !time) return;

    if (siteKey && !turnstileToken) {
      setError('Please complete the CAPTCHA check.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meetingType,
          startTime: time,
          name,
          email,
          notes,
          turnstileToken,
          timezone,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'SLOT NO LONGER AVAILABLE. SELECT ANOTHER.');
      }

      setBookingResult(data);
      setStep(5);
    } catch (err: any) {
      setError(err.message || 'BOOKING FAILED');
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedTimeString = time
    ? new Date(time).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: timezone,
      })
    : '--';

  return (
    <div className="relative min-h-screen bg-[var(--bg)] text-[var(--text-primary)] flex flex-col justify-between p-4 md:p-12 transition-colors duration-200 overflow-hidden">
      <Canvas3D />
      <header className="relative z-10 flex justify-between items-center pb-6 hairline-b font-mono-spec text-xs tracking-widest uppercase mb-8 backdrop-blur-sm bg-[var(--bg)]/80">
        <div className="flex items-center gap-3">
          <span className="font-black text-[var(--text-primary)]">CAPYTECH UK / SPEC-BOOKING</span>
          <span className="hidden md:flex items-center gap-1.5 text-[10px] px-2.5 py-0.5 rounded border hairline-border text-[var(--text-muted)] font-bold">
            <Sparkles className="w-3 h-3 text-blue-500" /> 3D AMBIENT CANVAS
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-[var(--text-muted)] font-extrabold hidden sm:inline">
            HOST: JASON
          </span>
          <ThemeToggle />
        </div>
      </header>

      <main className="relative z-10 grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12 flex-1 items-start">
        <div className="lg:col-span-1 hairline-border p-6 flex flex-col justify-between bg-[var(--surface)]/90 backdrop-blur-md min-h-[380px] sticky top-8 shadow-xl">
          <div className="space-y-6">
            <div className="font-mono-spec text-xs tracking-widest text-[var(--text-muted)] font-black uppercase">
              STEP 0{step} / 05
            </div>
            <div className="space-y-3 font-mono-spec text-xs tracking-wider uppercase">
              <div className="flex justify-between py-1.5 hairline-b">
                <span className="text-[var(--text-muted)] font-bold">TYPE</span>
                <span className="font-black text-[var(--text-primary)]">
                  {currentTypeMeta?.name || '--'}
                </span>
              </div>
              <div className="flex justify-between py-1.5 hairline-b">
                <span className="text-[var(--text-muted)] font-bold">DATE</span>
                <span className="font-black text-[var(--text-primary)]">{dateStr || '--'}</span>
              </div>
              <div className="flex justify-between py-1.5 hairline-b">
                <span className="text-[var(--text-muted)] font-bold">TIME</span>
                <span className="font-black text-[var(--text-primary)]">{selectedTimeString}</span>
              </div>
              <div className="flex justify-between py-1.5 hairline-b">
                <label htmlFor="guest-timezone" className="text-[var(--text-muted)] font-bold">
                  ZONE
                </label>
                <select
                  id="guest-timezone"
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    setTime(undefined);
                  }}
                  className="max-w-[60%] bg-transparent text-right font-black text-[var(--text-primary)] cursor-pointer"
                >
                  {timezoneOptions.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-between py-1.5 hairline-b">
                <span className="text-[var(--text-muted)] font-bold">LENGTH</span>
                <span className="font-black text-[var(--text-primary)]">
                  {currentTypeMeta?.duration || '--'}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-6 font-mono-spec text-[10px] tracking-widest text-[var(--text-muted)] font-black uppercase">
            <div className="flex justify-between mb-1">
              <span>PROGRESS</span>
              <span>{progressPercentage}%</span>
            </div>
            <div className="w-full bg-[var(--line)] h-[2px]">
              <div
                className="bg-blue-600 h-[2px] transition-all duration-300 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8 bg-[var(--bg)]/90 backdrop-blur-md p-6 sm:p-8 hairline-border shadow-xl">
          {step === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-[var(--text-primary)] mb-2">
                  Select meeting type.
                </h2>
                <div className="p-3.5 bg-[var(--tip-bg)] border-l-4 border-[var(--tip-border)] text-[var(--tip-text)] font-mono-spec text-xs font-bold tracking-wide">
                  <strong>TIP:</strong> Click one of the meeting options below to choose your
                  desired meeting length.
                </div>
              </div>
              {configError && (
                <div className="p-4 hairline-border border-red-600 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 font-mono-spec text-xs tracking-wider uppercase text-center font-bold">
                  {configError}
                </div>
              )}
              {!config && !configError && (
                <div className="p-8 hairline-border text-center font-mono-spec text-xs tracking-widest text-[var(--text-muted)] uppercase bg-[var(--surface)] font-bold">
                  LOADING MEETING OPTIONS...
                </div>
              )}
              <div className="hairline-t hairline-b divide-y divide-[var(--line)]">
                {meetingTypesList.map((m, idx) => (
                  <button
                    key={m.slug}
                    type="button"
                    onClick={() => {
                      setMeetingType(m.slug);
                      setStep(2);
                    }}
                    className={cn(
                      'w-full text-left py-6 px-4 flex justify-between items-center cursor-pointer transition-all hover:bg-[var(--surface-hover)]',
                      meetingType === m.slug &&
                        'bg-[var(--surface)] font-bold border-l-4 border-blue-600',
                    )}
                  >
                    <div>
                      <span className="font-mono-spec text-sm uppercase tracking-wider text-[var(--text-primary)] font-black block mb-1">
                        0{idx + 1} {m.name}
                      </span>
                      <p className="text-[var(--text-secondary)] text-xs font-semibold">{m.desc}</p>
                    </div>
                    <span className="font-mono-spec text-xs tracking-widest text-[var(--slot-text)] bg-[var(--slot-bg)] border border-[var(--slot-border)] px-3 py-1.5 font-black rounded-md">
                      {m.duration}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="flex justify-between items-baseline">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-primary)] mb-2">
                    Select date.
                  </h2>
                  <div className="p-3.5 bg-[var(--tip-bg)] border-l-4 border-[var(--tip-border)] text-[var(--tip-text)] font-mono-spec text-xs font-bold tracking-wide">
                    <strong>TIP:</strong> Click any blue-tinted box on the calendar grid below to
                    pick an available date.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-3 py-1.5 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>
              <DayPicker
                selectedDate={date}
                maxAdvanceDays={config?.maxAdvanceDays}
                workingWeekdays={sameOffsetAsHost ? config?.workingWeekdays : undefined}
                onSelect={(d) => {
                  setDate(d);
                  setTime(undefined);
                  setStep(3);
                }}
              />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <div className="flex justify-between items-baseline">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-primary)] mb-2">
                    Select time.
                  </h2>
                  <div className="p-3.5 bg-[var(--tip-bg)] border-l-4 border-[var(--tip-border)] text-[var(--tip-text)] font-mono-spec text-xs font-bold tracking-wide">
                    <strong>TIP:</strong> Click a time box from the grid below, then click 'CONTINUE
                    TO DETAILS'.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-3 py-1.5 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>
              {dateStr && meetingType && (
                <SlotList
                  dateStr={dateStr}
                  meetingType={meetingType}
                  guestTimezone={timezone}
                  hostTimezone={hostTimezone}
                  selectedTime={time}
                  onSelect={(t) => {
                    setTime(t);
                  }}
                />
              )}
              <div className="pt-4 flex justify-end">
                <button
                  type="button"
                  disabled={!time}
                  onClick={() => setStep(4)}
                  className="w-full md:w-auto px-8 py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-mono-spec text-xs font-black tracking-widest uppercase disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-md rounded-lg"
                >
                  CONTINUE TO DETAILS
                </button>
              </div>
            </div>
          )}

          {step === 4 && (
            <form onSubmit={handleSubmit} className="space-y-8">
              <div className="flex justify-between items-baseline">
                <div>
                  <h2 className="text-3xl font-black text-[var(--text-primary)] mb-2">
                    Enter details.
                  </h2>
                  <div className="p-3.5 bg-[var(--tip-bg)] border-l-4 border-[var(--tip-border)] text-[var(--tip-text)] font-mono-spec text-xs font-bold tracking-wide">
                    <strong>TIP:</strong> Enter your full name and email address to reserve the
                    appointment.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-3 py-1.5 rounded-lg border hairline-border font-mono-spec text-xs text-[var(--text-primary)] font-extrabold hover:bg-[var(--surface-hover)] uppercase cursor-pointer transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Back
                </button>
              </div>
              {error && (
                <div className="p-4 hairline-border border-red-600 bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300 font-mono-spec text-xs tracking-wider uppercase text-center font-bold">
                  {error}
                </div>
              )}
              <div className="space-y-6">
                <div>
                  <label
                    htmlFor="guest-name"
                    className="block font-mono-spec text-[10px] uppercase tracking-widest text-[var(--text-primary)] font-black mb-1"
                  >
                    FULL NAME *
                  </label>
                  <input
                    id="guest-name"
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Guest"
                    className="w-full input-underline"
                  />
                </div>
                <div>
                  <label
                    htmlFor="guest-email"
                    className="block font-mono-spec text-[10px] uppercase tracking-widest text-[var(--text-primary)] font-black mb-1"
                  >
                    EMAIL ADDRESS *
                  </label>
                  <input
                    id="guest-email"
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.com"
                    className="w-full input-underline"
                  />
                </div>
                <div>
                  <label
                    htmlFor="guest-notes"
                    className="block font-mono-spec text-[10px] uppercase tracking-widest text-[var(--text-primary)] font-black mb-1"
                  >
                    NOTES (OPTIONAL)
                  </label>
                  <textarea
                    id="guest-notes"
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Meeting context..."
                    className="w-full input-underline resize-none"
                  />
                </div>
                {siteKey && (
                  <div className="pt-2">
                    <div
                      className="cf-turnstile"
                      data-sitekey={siteKey}
                      data-callback="onTurnstileSuccess"
                    ></div>
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-mono-spec text-xs font-black tracking-widest uppercase disabled:opacity-30 cursor-pointer transition-colors shadow-md rounded-lg"
              >
                {isSubmitting ? 'RESERVING SLOT...' : 'CONFIRM BOOKING'}
              </button>
            </form>
          )}

          {step === 5 && (
            <div className="space-y-8">
              <div className="p-4 hairline-border border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-300 font-mono-spec text-xs tracking-widest uppercase text-center font-bold">
                BOOKING CONFIRMED.
              </div>
              <h2 className="text-5xl font-black text-[var(--text-primary)] tracking-tight">
                Confirmed.
              </h2>
              <p className="text-[var(--text-secondary)] text-sm leading-relaxed font-semibold">
                A calendar invitation with video details has been dispatched to{' '}
                <strong className="text-[var(--text-primary)] font-mono-spec">{email}</strong>.
              </p>
              {bookingResult?.meetLink && (
                <div className="pt-2">
                  <a
                    href={bookingResult.meetLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-mono-spec text-xs font-black tracking-widest uppercase transition-colors cursor-pointer shadow-md rounded-lg"
                  >
                    <span>JOIN VIDEO CALL</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
              {bookingResult?.manageToken && (
                <div className="pt-6 hairline-t font-mono-spec text-xs space-y-2">
                  <span className="text-[var(--text-muted)] uppercase tracking-widest font-black block">
                    SELF-SERVICE PORTAL
                  </span>
                  <a
                    href={`/manage/${bookingResult.manageToken}`}
                    className="inline-block text-blue-600 dark:text-blue-400 font-black uppercase underline hover:text-blue-800 dark:hover:text-blue-300 cursor-pointer"
                  >
                    /manage/{bookingResult.manageToken}
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <footer className="relative z-10 pt-8 hairline-t font-mono-spec text-[10px] tracking-widest uppercase text-[var(--text-muted)] font-black flex justify-between mt-8 backdrop-blur-sm bg-[var(--bg)]/80">
        <span>MEET.CAPYTECH.CO.UK</span>
        <span>UTC TIMESTAMP ENFORCED</span>
      </footer>
    </div>
  );
}
