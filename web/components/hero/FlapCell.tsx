'use client';

import { memo, useEffect, useRef, useState } from 'react';

/** Drum order of the physical board. Turkish letters sit next to their base letters. */
export const DRUM = " ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZQWX0123456789:.,-/&?!'";
const MAX_STEPS = 9;
const STEP_MS = 74;

function drumIndex(ch: string): number {
  const i = DRUM.indexOf(ch);
  return i === -1 ? 0 : i;
}

/** Characters the drum passes through on its way from `from` to `to` (inclusive of `to`). */
export function drumPath(from: string, to: string, spin = 0): string[] {
  if (from === to && spin === 0) return [];
  // Glyph not on the drum (rare punctuation): just land on it.
  if (DRUM.indexOf(to) === -1) return [to];
  const size = DRUM.length;
  const end = drumIndex(to);
  const distance = (end - drumIndex(from) + size) % size;
  const steps = Math.min(MAX_STEPS, distance + spin);
  if (steps === 0) return [];
  // Long trips skip ahead so every cell settles within MAX_STEPS flips, always ending on `to`.
  const start = (end - steps + size) % size;
  const path: string[] = [];
  for (let s = 1; s <= steps; s += 1) path.push(DRUM[(start + s) % size]);
  return path;
}

function setGlyph(half: Element | undefined, ch: string): void {
  const glyph = half?.firstElementChild;
  if (glyph) glyph.textContent = ch;
}

async function flipOnce(cell: HTMLElement, from: string, to: string): Promise<void> {
  const [top, bottom, flapTop, flapBottom] = Array.from(cell.children) as HTMLElement[];
  setGlyph(top, to);
  setGlyph(bottom, from);
  setGlyph(flapTop, from);
  setGlyph(flapBottom, to);
  flapTop.style.visibility = 'visible';
  const fall = flapTop.animate(
    [
      { transform: 'rotateX(0deg)', filter: 'brightness(1)' },
      { transform: 'rotateX(-90deg)', filter: 'brightness(0.55)' },
    ],
    { duration: STEP_MS / 2, easing: 'cubic-bezier(.55,0,1,.45)', fill: 'forwards' },
  );
  await fall.finished;
  flapTop.style.visibility = 'hidden';
  flapBottom.style.visibility = 'visible';
  const land = flapBottom.animate(
    [
      { transform: 'rotateX(90deg)', filter: 'brightness(1.35)' },
      { transform: 'rotateX(0deg)', filter: 'brightness(1)' },
    ],
    { duration: STEP_MS / 2, easing: 'cubic-bezier(0,.55,.45,1)', fill: 'forwards' },
  );
  await land.finished;
  setGlyph(bottom, to);
  flapBottom.style.visibility = 'hidden';
  fall.cancel();
  land.cancel();
}

export interface FlapCellProps {
  char: string;
  /** Delay before this cell starts moving, in ms. */
  delay: number;
  /** Extra drum steps on first appearance, so the board visibly "spins up". */
  spin: number;
  animate: boolean;
  size?: 'xl' | 'lg' | 'sm';
  tone?: 'accent' | 'dim';
}

/**
 * One split-flap cell. React renders the initial glyph once; every later change is applied
 * imperatively with the Web Animations API, so text nodes are never contested with React.
 */
export const FlapCell = memo(function FlapCell({
  char,
  delay,
  spin,
  animate,
  size,
  tone,
}: FlapCellProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const [initial] = useState(char);
  const shown = useRef(char);
  const first = useRef(true);
  /** The flip currently running on this cell; new work waits for it so flips never overlap. */
  const busy = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const cell = ref.current;
    if (!cell) return;
    const extra = first.current ? spin : 0;
    first.current = false;

    if (!animate || typeof cell.animate !== 'function') {
      for (const half of Array.from(cell.children)) setGlyph(half, char);
      shown.current = char;
      return;
    }

    let cancelled = false;
    const run = async () => {
      // Let any in-flight flip land first, then plan the path from what is really showing.
      await busy.current;
      for (const next of drumPath(shown.current, char, extra)) {
        if (cancelled || !cell.isConnected) return;
        const step = flipOnce(cell, shown.current, next);
        busy.current = step;
        await step;
        shown.current = next;
      }
    };
    const timer = window.setTimeout(() => void run(), delay);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [char, delay, spin, animate]);

  const cls = [
    'flap',
    size === 'xl' ? 'flap--xl' : size === 'lg' ? 'flap--lg' : size === 'sm' ? 'flap--sm' : '',
    tone ? `flap--${tone}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span ref={ref} className={cls} aria-hidden="true">
      <span className="t">
        <i>{initial}</i>
      </span>
      <span className="b">
        <i>{initial}</i>
      </span>
      <span className="ft">
        <i>{initial}</i>
      </span>
      <span className="fb">
        <i>{initial}</i>
      </span>
    </span>
  );
});
