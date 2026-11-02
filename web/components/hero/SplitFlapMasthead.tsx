'use client';

import { useReducedMotion } from '@/lib/hooks';

import { FlapCell } from './FlapCell';

const MASTHEAD = 'TAGNEWSPAPER';

/** The one split-flap element on the page: the nameplate spins up once on load. */
export function SplitFlapMasthead() {
  const animate = !useReducedMotion();
  return (
    <div className="board flex justify-center gap-[3px] sm:gap-[5px]" aria-hidden="true">
      {Array.from(MASTHEAD).map((ch, i) => (
        <FlapCell
          key={i}
          char={ch}
          delay={120 + i * 70}
          spin={4 + (i % 4)}
          animate={animate}
          size="xl"
          tone={i < 3 ? 'accent' : undefined}
        />
      ))}
    </div>
  );
}
