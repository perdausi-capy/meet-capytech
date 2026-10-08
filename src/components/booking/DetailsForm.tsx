'use client';

import { useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, CalendarDays, Clock, Globe, Loader2, Video } from 'lucide-react';
import { gsap, useGsap } from '@/lib/motion';
import { formatInstantDate, formatTime } from '@/lib/time-format';
import { Turnstile } from './Turnstile';

export interface GuestDetails {
  name: string;
  email: string;
  company: string;
  notes: string;
  turnstileToken?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function BookingSummary({
  meetingName,
  durationMinutes,
  location,
  startsAt,
  timezone,
  hour12,
}: {
  meetingName: string;
  durationMinutes: number;
  location: string;
  startsAt: string;
  timezone: string;
  hour12: boolean;
}) {
  const end = new Date(new Date(startsAt).getTime() + durationMinutes * 60_000).toISOString();
  return (
    <div className="rounded-2xl border border-hairline bg-card-solid p-4">
      <p className="font-semibold text-ink">{meetingName}</p>
      <ul className="mt-3 space-y-2 text-sm text-ink-2">
        <li className="flex items-center gap-2.5">
          <CalendarDays className="h-4 w-4 shrink-0 text-brand" />
          {formatInstantDate(startsAt, timezone)}
        </li>
        <li className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 shrink-0 text-brand" />
          {formatTime(startsAt, timezone, hour12)} – {formatTime(end, timezone, hour12)} ·{' '}
          {durationMinutes} min
        </li>
        <li className="flex items-center gap-2.5">
          <Globe className="h-4 w-4 shrink-0 text-brand" />
          {timezone.replace(/_/g, ' ')}
        </li>
        <li className="flex items-center gap-2.5">
          <Video className="h-4 w-4 shrink-0 text-brand" />
          {location}
        </li>
      </ul>
    </div>
  );
}

export function DetailsForm({
  initial,
  siteKey,
  submitting,
  error,
  onBack,
  onSubmit,
  summary,
}: {
  initial: Partial<GuestDetails>;
  siteKey: string | null;
  submitting: boolean;
  error: string;
  onBack: () => void;
  onSubmit: (details: GuestDetails) => void;
  summary?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLFormElement>(null);
  const [values, setValues] = useState<GuestDetails>({
    name: initial.name ?? '',
    email: initial.email ?? '',
    company: initial.company ?? '',
    notes: initial.notes ?? '',
  });
  const [token, setToken] = useState<string | undefined>(undefined);
  const [touched, setTouched] = useState(false);

  useGsap(
    () => {
      gsap.from('[data-anim="field"]', {
        y: 14,
        opacity: 0,
        duration: 0.5,
        stagger: 0.06,
        ease: 'power3.out',
        clearProps: 'transform,opacity',
      });
    },
    [],
    rootRef,
  );

  useGsap(
    () => {
      if (!error) return;
      gsap.fromTo(
        '[data-anim="error"]',
        { x: -6 },
        { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.3)' },
      );
    },
    [error],
    rootRef,
  );

  const errors = {
    name: values.name.trim().length < 2 ? 'Please enter your name' : '',
    email: !EMAIL_RE.test(values.email.trim()) ? 'Please enter a valid email address' : '',
    captcha: siteKey && !token ? 'Please complete the check below' : '',
  };
  const valid = !errors.name && !errors.email && !errors.captcha;

  const set = (key: keyof GuestDetails) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [key]: e.target.value }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || submitting) return;
    onSubmit({
      ...values,
      name: values.name.trim(),
      email: values.email.trim(),
      turnstileToken: token,
    });
  };

  return (
    <form ref={rootRef} onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div data-anim="field" className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to times"
          className="icon-btn focus-ring"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Your details</h2>
      </div>

      {summary && <div data-anim="field">{summary}</div>}

      {error && (
        <div
          data-anim="error"
          role="alert"
          className="rounded-xl border border-danger px-4 py-3 text-sm font-medium text-danger"
        >
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div data-anim="field">
          <label htmlFor="guest-name" className="mb-1.5 block text-sm font-medium text-ink">
            Name <span className="text-danger">*</span>
          </label>
          <input
            id="guest-name"
            className="field"
            autoComplete="name"
            value={values.name}
            onChange={set('name')}
            aria-invalid={touched && Boolean(errors.name)}
            aria-describedby="guest-name-error"
          />
          {touched && errors.name && (
            <p id="guest-name-error" className="mt-1 text-xs text-danger">
              {errors.name}
            </p>
          )}
        </div>
        <div data-anim="field">
          <label htmlFor="guest-email" className="mb-1.5 block text-sm font-medium text-ink">
            Email <span className="text-danger">*</span>
          </label>
          <input
            id="guest-email"
            type="email"
            className="field"
            autoComplete="email"
            value={values.email}
            onChange={set('email')}
            aria-invalid={touched && Boolean(errors.email)}
            aria-describedby="guest-email-error"
          />
          {touched && errors.email && (
            <p id="guest-email-error" className="mt-1 text-xs text-danger">
              {errors.email}
            </p>
          )}
        </div>
      </div>

      <div data-anim="field">
        <label htmlFor="guest-company" className="mb-1.5 block text-sm font-medium text-ink">
          Company <span className="font-normal text-muted">(optional)</span>
        </label>
        <input
          id="guest-company"
          className="field"
          autoComplete="organization"
          maxLength={100}
          value={values.company}
          onChange={set('company')}
        />
      </div>

      <div data-anim="field">
        <label htmlFor="guest-notes" className="mb-1.5 block text-sm font-medium text-ink">
          Anything we should know? <span className="font-normal text-muted">(optional)</span>
        </label>
        <textarea
          id="guest-notes"
          rows={3}
          maxLength={1000}
          className="field resize-none"
          placeholder="What would you like to discuss?"
          value={values.notes}
          onChange={set('notes')}
        />
      </div>

      {siteKey && (
        <div data-anim="field">
          <Turnstile siteKey={siteKey} onToken={setToken} />
          {touched && errors.captcha && (
            <p className="mt-1 text-xs text-danger">{errors.captcha}</p>
          )}
        </div>
      )}

      <div data-anim="field">
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary focus-ring w-full py-4 text-base"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitting ? 'Booking…' : 'Confirm booking'}
        </button>
      </div>
      <p data-anim="field" className="-mt-2 text-center text-xs text-muted">
        You’ll get a calendar invite and a confirmation email with a link to reschedule or cancel.
      </p>
    </form>
  );
}
