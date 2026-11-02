'use client';

import { type PointerEvent, useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/lib/hooks';

import { DRUM, FlapCell } from './FlapCell';

const MASTHEAD = 'TAGNEWSPAPER';
const IDLE_MS = 6_500;
const LETTERS = DRUM.replace(/[^A-ZÇĞİÖŞÜ]/g, '');
/** How long a disturbed cell shows its stray letter before flipping home. */
const RETURN_MS = 260;
/** A cell rests this long before the pointer can flip it again. */
const COOLDOWN_MS = 900;
/** Neighbours follow the touched cell after this delay, so the flip travels like a wave. */
const WAVE_MS = 70;

const randomLetter = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];

/**
 * The nameplate: a split-flap board in its housing. It spins up once on load; every few
 * seconds one letter flips away and back; and the letters under the pointer (or finger)
 * flip in a small wave as it moves across the board.
 */
export function SplitFlapMasthead() {
  const animate = !useReducedMotion();
  const [chars, setChars] = useState<string[]>(() => Array.from(MASTHEAD));
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cooldown = useRef<number[]>(Array(MASTHEAD.length).fill(0));
  const timers = useRef<number[]>([]);
  /** The staggered start belongs to the load sequence only; later flips start at once. */
  const [settled, setSettled] = useState(false);

  /** Flip one cell to a stray letter and back home shortly after. */
  const disturb = (i: number, delay = 0) => {
    const now = performance.now();
    if (i < 0 || i >= MASTHEAD.length || cooldown.current[i] > now) return;
    cooldown.current[i] = now + COOLDOWN_MS + delay;
    timers.current.push(
      window.setTimeout(() => {
        setChars((prev) => prev.map((c, j) => (j === i ? randomLetter() : c)));
        timers.current.push(
          window.setTimeout(
            () => setChars((prev) => prev.map((c, j) => (j === i ? MASTHEAD[j] : c))),
            RETURN_MS,
          ),
        );
      }, delay),
    );
  };

  useEffect(() => {
    const pending = timers.current;
    const intro = window.setTimeout(() => setSettled(true), 2_500);
    return () => {
      window.clearTimeout(intro);
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    if (!animate || !rootRef.current) return;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(rootRef.current);
    const timer = window.setInterval(() => {
      if (!visible || document.visibilityState !== 'visible') return;
      disturb(Math.floor(Math.random() * MASTHEAD.length));
    }, IDLE_MS);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [animate]);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!animate || !boardRef.current) return;
    const box = boardRef.current.getBoundingClientRect();
    const i = Math.floor(((e.clientX - box.left) / box.width) * MASTHEAD.length);
    disturb(i);
    disturb(i - 1, WAVE_MS);
    disturb(i + 1, WAVE_MS);
  };

  return (
    <div ref={rootRef} className="board-frame" aria-hidden="true" onPointerMove={onPointerMove}>
      <div ref={boardRef} className="board flex justify-center gap-[3px] sm:gap-[6px]">
        {chars.map((ch, i) => (
          <FlapCell
            key={i}
            char={ch}
            delay={settled ? 0 : 120 + i * 70}
            spin={4 + (i % 4)}
            animate={animate}
            size="xl"
            tone={i < 3 ? 'accent' : undefined}
          />
        ))}
      </div>
    </div>
  );
}
