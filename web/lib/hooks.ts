'use client';

import { useSyncExternalStore } from 'react';

const MINUTE = 60_000;

function subscribeMinute(onChange: () => void): () => void {
  const id = window.setInterval(onChange, MINUTE);
  return () => window.clearInterval(id);
}

/** Current time rounded to the minute; undefined during SSR so markup stays deterministic. */
export function useNow(): number | undefined {
  return useSyncExternalStore(
    subscribeMinute,
    () => Math.floor(Date.now() / MINUTE) * MINUTE,
    () => undefined,
  );
}

const REDUCE = '(prefers-reduced-motion: reduce)';

function subscribeReduce(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCE);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** True on the server and for users who ask for less motion. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduce,
    () => window.matchMedia(REDUCE).matches,
    () => true,
  );
}

function subscribeScroll(onChange: () => void): () => void {
  window.addEventListener('scroll', onChange, { passive: true });
  window.addEventListener('resize', onChange);
  return () => {
    window.removeEventListener('scroll', onChange);
    window.removeEventListener('resize', onChange);
  };
}

/** Whether the page has scrolled past `fraction` of the viewport height. */
export function useScrolledPast(fraction: number): boolean {
  return useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > window.innerHeight * fraction,
    () => false,
  );
}
