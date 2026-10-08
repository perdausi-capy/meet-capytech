'use client';

import { useEffect, useLayoutEffect, type DependencyList, type RefObject } from 'react';
import { gsap } from 'gsap';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Runs GSAP animations scoped to `scope` (selector strings only match inside it) and reverts
 * them on cleanup or when deps change. Skipped entirely for users who prefer reduced motion,
 * so content simply appears in its final state.
 */
export function useGsap(
  animate: () => void,
  deps: DependencyList,
  scope: RefObject<HTMLElement | null>,
) {
  useIsoLayoutEffect(() => {
    if (!scope.current || prefersReducedMotion()) return;
    const ctx = gsap.context(animate, scope);
    return () => ctx.revert();
  }, deps);
}

export { gsap };
