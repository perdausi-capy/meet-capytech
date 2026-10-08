'use client';

import { useRef } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ThemeToggle';
import { gsap, useGsap } from '@/lib/motion';
import { AuroraBackground } from './AuroraBackground';

/** Full-width page frame for guest pages: backdrop, header, content sections, footer. */
export function GuestShell({
  children,
  footer,
  headerActions,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Extra controls next to the theme toggle (e.g. the guide switch). */
  headerActions?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useGsap(
    () => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('[data-anim="header"]', { y: -12, opacity: 0, duration: 0.6 })
        .from('[data-anim="footer"]', { opacity: 0, duration: 0.6 }, '-=0.2');
    },
    [],
    rootRef,
  );

  return (
    <div ref={rootRef} className="guest-root relative isolate flex min-h-screen flex-col font-sans">
      <AuroraBackground />

      <header
        data-anim="header"
        className="mx-auto flex w-full max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12"
      >
        <Link href="/" className="focus-ring inline-flex items-center gap-2.5 rounded-lg">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-ink text-sm font-bold text-canvas">
            C
          </span>
          <span className="text-[0.95rem] font-semibold tracking-tight text-ink">Capytech UK</span>
        </Link>
        <div className="flex items-center gap-2">
          {headerActions}
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-6 px-5 pb-12 sm:px-8 lg:gap-8 lg:px-12">
        {children}
      </main>

      <footer
        data-anim="footer"
        className="mx-auto w-full max-w-[1440px] px-5 pb-8 text-center text-xs text-muted sm:px-8 lg:px-12"
      >
        {footer}
      </footer>
    </div>
  );
}

/** Numbered section heading: "01  Choose a meeting  ———— aside". */
export function SectionHeading({
  index,
  title,
  aside,
  id,
}: {
  index: string;
  title: string;
  aside?: React.ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <span className="font-mono text-sm font-medium text-brand">{index}</span>
      <h2 id={id} className="text-2xl font-semibold tracking-tight text-ink sm:text-[1.75rem]">
        {title}
      </h2>
      <span aria-hidden className="hidden h-px min-w-8 flex-1 bg-hairline sm:block" />
      {aside && <div className="text-sm text-muted">{aside}</div>}
    </div>
  );
}
