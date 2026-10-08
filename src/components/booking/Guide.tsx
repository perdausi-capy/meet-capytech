'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Compass, X } from 'lucide-react';
import { gsap, prefersReducedMotion } from '@/lib/motion';

/* ------------------------------------------------------------------ */
/* Preference                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = 'booking-guide';

/** Guide on/off, remembered per browser. On by default for first-time visitors. */
export function useGuidePreference() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      stored = null;
    }
    setEnabled(stored !== 'off');
    setReady(true);
  }, []);

  const set = useCallback((on: boolean) => {
    setEnabled(on);
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // Not persisted (private mode); still applies for this visit.
    }
  }, []);

  return { enabled: ready && enabled, setEnabled: set };
}

/* ------------------------------------------------------------------ */
/* Suspending the spotlight while a modal (the clock) is open           */
/* ------------------------------------------------------------------ */

const GuideSuspendContext = createContext<(suspended: boolean) => void>(() => {});

export const GuideSuspendProvider = GuideSuspendContext.Provider;

/** Components that open their own overlay call this so the guide steps aside meanwhile. */
export function useSuspendGuide(active: boolean) {
  const suspend = useContext(GuideSuspendContext);
  useEffect(() => {
    suspend(active);
    return () => suspend(false);
  }, [active, suspend]);
}

/* ------------------------------------------------------------------ */
/* Header toggle                                                       */
/* ------------------------------------------------------------------ */

export function GuideToggle({ on, onChange }: { on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? 'Turn the booking guide off' : 'Turn the booking guide on'}
      onClick={() => onChange(!on)}
      className="focus-ring inline-flex h-9 items-center gap-2 rounded-full border border-hairline bg-card pl-3 pr-3.5 text-sm font-medium text-ink-2 transition-colors hover:border-brand hover:text-brand"
    >
      <Compass className="h-4 w-4" />
      <span className="hidden sm:inline">Guide {on ? 'on' : 'off'}</span>
      <span
        aria-hidden
        className={`h-2 w-2 rounded-full transition-colors ${
          on ? 'bg-brand shadow-[0_0_0_3px_var(--g-brand-soft)]' : 'border border-muted'
        }`}
      />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* The guide: a concierge note, a viewfinder frame and a drawn line     */
/* ------------------------------------------------------------------ */

export interface GuideStep {
  /** Stable id; the note animates when it changes. */
  id: string;
  /** `data-guide` value of the element to frame, or null for none. */
  target: string | null;
  /** Big serif mark on the left: a step number ("02") or a word ("Hi."). */
  numeral: string;
  /** Headline as "lead *emphasis*", e.g. "Pick a" + "day." */
  lead: string;
  em: string;
  body: string;
  progress?: { current: number; total: number };
  /** For steps that need no action on the page (e.g. "Next"); otherwise the note waits. */
  primary?: { label: string; onClick: () => void };
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface Geometry {
  frame: Rect | null;
  /** Connector from the note to the frame, in viewport coordinates. */
  line: { d: string; x: number; y: number } | null;
}

const PAD = 12;

function targetRect(target: string | null): Rect | null {
  if (!target) return null;
  const el = document.querySelector<HTMLElement>(`[data-guide="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    top: r.top - PAD,
    left: r.left - PAD,
    width: r.width + PAD * 2,
    height: r.height + PAD * 2,
  };
}

/** A gentle curve from the note's top edge to the nearest edge of the frame. */
function connector(note: DOMRect, frame: Rect): Geometry['line'] {
  const right = frame.left + frame.width;
  const bottom = frame.top + frame.height;
  // Start on the note's top edge, nudged towards the frame.
  const sx = Math.min(Math.max(frame.left + frame.width / 2, note.left + 40), note.right - 40);
  const sy = note.top;
  let ex = Math.min(Math.max(sx, frame.left + 24), right - 24);
  let ey: number;
  if (bottom < sy - 24) {
    ey = bottom; // frame above the note: meet its bottom edge
  } else if (frame.top > note.bottom + 24) {
    ey = frame.top; // frame below (rare): meet its top edge
  } else {
    // Side by side: meet the near side, halfway down the visible part.
    ex = frame.left > note.right ? frame.left : right;
    ey = Math.min(Math.max(frame.top + frame.height / 2, 40), sy - 40);
  }
  if (Math.hypot(ex - sx, ey - sy) < 48) return null;
  const bend = Math.max(40, Math.abs(sy - ey) * 0.5);
  const d = `M ${sx} ${sy} C ${sx} ${sy - bend}, ${ex} ${ey + bend * (ey < sy ? 1 : -1)}, ${ex} ${ey}`;
  return { d, x: ex, y: ey };
}

/**
 * Follows the guest through booking. A concierge-style note says what to do next, corner marks
 * frame where, and a fine line connects the two. The page stays fully usable underneath.
 */
export function BookingGuide({
  step,
  suspended,
  onSkip,
}: {
  step: GuideStep;
  suspended: boolean;
  onSkip: () => void;
}) {
  const noteRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const [geo, setGeo] = useState<Geometry>({ frame: null, line: null });
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Bring the target into view when the step changes. On phones the note covers the bottom of
  // the screen, so put the target at the top instead of the middle.
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector<HTMLElement>(`[data-guide="${step.target}"]`);
    if (!el) return;
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    if (window.matchMedia('(max-width: 639px)').matches) {
      // Top-align the target; if it's taller than the space above the note, bottom-align it just
      // above the note instead, so the part the guest needs to tap isn't hidden.
      const r = el.getBoundingClientRect();
      const noteHeight = noteRef.current?.offsetHeight ?? 0;
      const room = window.innerHeight - noteHeight - 32;
      const offset =
        r.height > room ? r.bottom - (window.innerHeight - noteHeight - 16) : r.top - 16;
      window.scrollTo({ top: window.scrollY + offset, behavior });
    } else {
      el.scrollIntoView({ behavior, block: 'center' });
    }
  }, [step.id, step.target]);

  // Phones: reserve space below the page equal to the note, so everything can scroll above it.
  useEffect(() => {
    const note = noteRef.current;
    if (!note || suspended) return;
    const narrow = window.matchMedia('(max-width: 639px)');
    const previous = document.body.style.paddingBottom;
    const apply = () => {
      document.body.style.paddingBottom = narrow.matches ? `${note.offsetHeight + 24}px` : previous;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(note);
    narrow.addEventListener('change', apply);
    return () => {
      observer.disconnect();
      narrow.removeEventListener('change', apply);
      document.body.style.paddingBottom = previous;
    };
  }, [suspended, mounted]);

  // Track target and note positions each frame (one or two rect reads; state only on change).
  useEffect(() => {
    let frame = 0;
    let last: string | null = null; // forces the first measurement (including "nothing") to apply
    const tick = () => {
      const rect = suspended ? null : targetRect(step.target);
      const note = noteRef.current?.getBoundingClientRect();
      const line = rect && note && window.innerWidth >= 640 ? connector(note, rect) : null;
      const key = JSON.stringify([rect, line?.d]);
      if (key !== last) {
        last = key;
        setGeo({ frame: rect, line });
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [step.target, suspended]);

  // Note content: numeral slides up, headline and body follow.
  useLayoutEffect(() => {
    const note = noteRef.current;
    if (!note || prefersReducedMotion()) return;
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo(note, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 })
      .fromTo(
        note.querySelector('[data-note="numeral"]'),
        { yPercent: 100 },
        { yPercent: 0, duration: 0.6, ease: 'power4.out' },
        '-=0.3',
      )
      .fromTo(
        note.querySelectorAll('[data-note="text"]'),
        { y: 10, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.45, stagger: 0.06 },
        '-=0.45',
      );
    return () => {
      tl.kill();
    };
  }, [step.id, suspended]);

  // Frame glides to the new target; corners snap in.
  useLayoutEffect(() => {
    const el = frameRef.current;
    const f = geo.frame;
    if (!el || !f) return;
    const props = { top: f.top, left: f.left, width: f.width, height: f.height };
    if (prefersReducedMotion() || el.dataset.placed !== '1') {
      gsap.set(el, props);
      el.dataset.placed = '1';
    } else {
      gsap.to(el, { ...props, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
    }
  }, [geo.frame]);

  useLayoutEffect(() => {
    if (!frameRef.current || prefersReducedMotion()) return;
    gsap.fromTo(
      frameRef.current.querySelectorAll('[data-corner]'),
      { scale: 1.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, stagger: 0.04, ease: 'back.out(2)' },
    );
  }, [step.id, Boolean(geo.frame)]);

  // The connector draws itself once per step (pathLength=1 keeps it valid while it follows).
  useLayoutEffect(() => {
    if (!pathRef.current || prefersReducedMotion()) return;
    gsap.fromTo(
      pathRef.current,
      { strokeDashoffset: 1 },
      { strokeDashoffset: 0, duration: 0.9, delay: 0.25, ease: 'power2.inOut' },
    );
  }, [step.id, Boolean(geo.line)]);

  // Keep the note out of the way: bottom-right by default (the right-hand column holds the less
  // important content), bottom-left only when the framed item is a narrow one on the right.
  const f = geo.frame;
  const noteOnRight = !(
    f !== null &&
    typeof window !== 'undefined' &&
    f.left + f.width / 2 > window.innerWidth / 2 &&
    f.width < window.innerWidth * 0.7
  );

  if (!mounted) return null;

  const corner = 'absolute h-6 w-6 border-[var(--guide-accent)]';

  return createPortal(
    <>
      {f && (
        <div ref={frameRef} aria-hidden className="guide-frame pointer-events-none fixed z-30">
          <span
            data-corner
            className={`${corner} -left-1 -top-1 rounded-tl-xl border-l-2 border-t-2`}
          />
          <span
            data-corner
            className={`${corner} -right-1 -top-1 rounded-tr-xl border-r-2 border-t-2`}
          />
          <span
            data-corner
            className={`${corner} -bottom-1 -left-1 rounded-bl-xl border-b-2 border-l-2`}
          />
          <span
            data-corner
            className={`${corner} -bottom-1 -right-1 rounded-br-xl border-b-2 border-r-2`}
          />
        </div>
      )}

      {geo.line && !suspended && (
        <svg aria-hidden className="pointer-events-none fixed inset-0 z-[35] h-full w-full">
          <path
            ref={pathRef}
            d={geo.line.d}
            pathLength={1}
            strokeDasharray="1"
            fill="none"
            className="stroke-[var(--guide-accent)]"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx={geo.line.x} cy={geo.line.y} r="4" className="fill-[var(--guide-accent)]" />
        </svg>
      )}

      {!suspended && (
        <div
          ref={noteRef}
          role="region"
          aria-label="Booking guide"
          aria-live="polite"
          className={`guide-note fixed inset-x-3 bottom-3 z-40 mx-auto max-w-md overflow-hidden rounded-[1.75rem] px-5 pb-3 pt-4 font-sans sm:px-6 sm:pb-4 sm:pt-5 shadow-2xl sm:inset-x-auto sm:bottom-6 sm:mx-0 sm:w-[400px] ${
            noteOnRight ? 'sm:right-6' : 'sm:left-6'
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="font-mono text-[0.7rem] tracking-[0.18em] text-[var(--guide-muted)]">
              {step.progress
                ? `${String(step.progress.current).padStart(2, '0')} / ${String(step.progress.total).padStart(2, '0')}`
                : 'BOOKING GUIDE'}
            </p>
            <button
              type="button"
              onClick={onSkip}
              aria-label="Close guide"
              className="focus-ring -mr-2 rounded-full p-1.5 text-[var(--guide-muted)] transition-colors hover:text-[var(--guide-fg)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-1 flex items-start gap-3 sm:mt-2 sm:gap-4">
            <div className="shrink-0 overflow-hidden">
              <span
                data-note="numeral"
                className="block font-display text-[3.25rem] leading-[0.95] text-[var(--guide-accent)] sm:text-[5rem]"
              >
                {step.numeral}
              </span>
            </div>
            <div className="min-w-0 pt-1.5">
              <p
                data-note="text"
                className="font-display text-[1.45rem] leading-[1.05] sm:text-[1.95rem]"
              >
                {step.lead} <em className="text-[var(--guide-accent)]">{step.em}</em>
              </p>
              <p
                data-note="text"
                className="mt-1.5 text-[0.8125rem] leading-relaxed text-[var(--guide-muted)] sm:mt-2 sm:text-sm"
              >
                {step.body}
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-[var(--guide-rule)] pt-2.5 sm:mt-4 sm:pt-3">
            <button
              type="button"
              onClick={onSkip}
              className="focus-ring rounded-md text-sm text-[var(--guide-muted)] underline-offset-4 transition-colors hover:text-[var(--guide-fg)] hover:underline"
            >
              skip guide
            </button>
            {step.primary ? (
              <button
                type="button"
                onClick={step.primary.onClick}
                className="focus-ring group inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-[var(--guide-accent)]"
              >
                {step.primary.label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
            ) : (
              <span className="inline-flex items-center gap-2 font-mono text-[0.7rem] tracking-[0.16em] text-[var(--guide-muted)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--guide-accent)]" />
                YOUR TURN
              </span>
            )}
          </div>
        </div>
      )}
    </>,
    document.body,
  );
}
