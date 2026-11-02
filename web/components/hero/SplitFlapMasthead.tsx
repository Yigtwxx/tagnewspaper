'use client';

import { useEffect, useRef, useState } from 'react';

import { useReducedMotion } from '@/lib/hooks';

import { DRUM, FlapCell } from './FlapCell';

const MASTHEAD = 'TAGNEWSPAPER';
const IDLE_MS = 6_500;
const LETTERS = DRUM.replace(/[^A-ZÇĞİÖŞÜ]/g, '');

/**
 * The nameplate: a split-flap board housed in a frame. It spins up once on load, then every
 * few seconds a single letter flips away and back, so the board feels alive without noise.
 */
export function SplitFlapMasthead() {
  const animate = !useReducedMotion();
  const [chars, setChars] = useState<string[]>(() => Array.from(MASTHEAD));
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!animate || !rootRef.current) return;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(rootRef.current);
    const restore: number[] = [];
    const timer = window.setInterval(() => {
      if (!visible || document.visibilityState !== 'visible') return;
      const i = Math.floor(Math.random() * MASTHEAD.length);
      const stray = LETTERS[Math.floor(Math.random() * LETTERS.length)];
      setChars((prev) => prev.map((c, j) => (j === i ? stray : c)));
      restore.push(window.setTimeout(() => setChars(Array.from(MASTHEAD)), 900));
    }, IDLE_MS);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
      restore.forEach((t) => window.clearTimeout(t));
    };
  }, [animate]);

  return (
    <div ref={rootRef} className="board-frame" aria-hidden="true">
      <div className="board flex justify-center gap-[3px] sm:gap-[6px]">
        {chars.map((ch, i) => (
          <FlapCell
            key={i}
            char={ch}
            delay={chars.join('') === MASTHEAD ? 120 + i * 70 : 0}
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
