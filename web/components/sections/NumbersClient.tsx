'use client';

import { useGSAP } from '@gsap/react';
import { type ReactNode, useRef } from 'react';

import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';

export interface DotGroup {
  count: number;
  /** How many of the dots are filled; the rest render as rings (a subset of the group). */
  filled: number;
  color: string;
}

/** Unit chart: one dot per 10,000 people. */
export function DotMatrix({
  group,
  columns,
  label,
}: {
  group: DotGroup;
  columns: number;
  label: string;
}) {
  const size = 10;
  const gap = 5;
  const rows = Math.ceil(group.count / columns);
  const w = columns * (size + gap) - gap;
  const h = rows * (size + gap) - gap;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="dots block w-full max-w-[520px]"
      role="img"
      aria-label={label}
    >
      {Array.from({ length: group.count }, (_, i) => {
        const cx = (i % columns) * (size + gap) + size / 2;
        const cy = Math.floor(i / columns) * (size + gap) + size / 2;
        const solid = i < group.filled;
        return (
          <circle
            key={i}
            cx={cx}
            cy={cy}
            r={solid ? size / 2 : size / 2 - 1}
            fill={solid ? group.color : 'none'}
            stroke={solid ? 'none' : group.color}
            strokeWidth={solid ? 0 : 2}
          />
        );
      })}
    </svg>
  );
}

/** Animates every `[data-count]` numeral and every `.dots circle` once the block enters view. */
export function NumbersMotion({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      registerGsap();
      const root = ref.current;

      for (const el of gsap.utils.toArray<HTMLElement>('[data-count]', root)) {
        const target = Number(el.dataset.count);
        const digits = Number(el.dataset.digits ?? 0);
        const state = { v: 0 };
        const fmt = new Intl.NumberFormat('tr-TR', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        });
        el.textContent = fmt.format(0);
        gsap.to(state, {
          v: target,
          duration: 1.8,
          ease: 'power3.out',
          scrollTrigger: { trigger: el, start: 'top 80%', once: true },
          onUpdate: () => {
            el.textContent = fmt.format(state.v);
          },
        });
      }

      for (const svg of gsap.utils.toArray<SVGElement>('.dots', root)) {
        gsap.from(svg.querySelectorAll('circle'), {
          opacity: 0.08,
          duration: 0.25,
          ease: 'none',
          stagger: { amount: 1.4, from: 'start' },
          scrollTrigger: { trigger: svg, start: 'top 75%', once: true },
        });
      }
    },
    { scope: ref },
  );

  return <div ref={ref}>{children}</div>;
}
