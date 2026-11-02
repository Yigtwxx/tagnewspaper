'use client';

import { useGSAP } from '@gsap/react';
import { useRef, useState } from 'react';

import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/labels';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';
import type { CategoryT } from '@/lib/schema';

const pct = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 0 });

/**
 * Each topic's share of coverage as one bar. Used while there are too few weeks for a
 * stream. Segments slide in one after another from the left, largest first.
 */
export function ShareBar({ totals }: { totals: Array<{ c: CategoryT; n: number }> }) {
  const ref = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<CategoryT | undefined>(undefined);
  const parts = totals.filter((t) => t.n > 0);
  const sum = parts.reduce((s, t) => s + t.n, 0) || 1;

  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      registerGsap();
      const tl = gsap.timeline({
        scrollTrigger: { trigger: ref.current, start: 'top 92%', once: true },
      });
      tl.from(ref.current.querySelectorAll('.share-seg'), {
        scaleX: 0,
        transformOrigin: '0% 50%',
        duration: 0.7,
        ease: 'power3.out',
        stagger: 0.12,
      });
      tl.from(
        ref.current.querySelectorAll('.share-row'),
        { opacity: 0, x: -16, duration: 0.45, stagger: 0.06, ease: 'power2.out' },
        0.3,
      );
    },
    { scope: ref },
  );

  return (
    <div ref={ref} className="flex flex-col gap-8">
      <div
        className="flex h-20 w-full overflow-hidden rounded-[3px]"
        role="img"
        aria-label="Konuların haberlerdeki payı"
      >
        {parts.map((t) => {
          const share = t.n / sum;
          return (
            <div
              key={t.c}
              className="share-seg relative flex items-center justify-center transition-opacity duration-300"
              style={{
                width: `${share * 100}%`,
                backgroundColor: CATEGORY_COLOR[t.c].dark,
                opacity: focus && focus !== t.c ? 0.25 : 1,
              }}
              onPointerEnter={() => setFocus(t.c)}
              onPointerLeave={() => setFocus(undefined)}
            >
              {share >= 0.09 && (
                <span className="px-2 text-center font-sans text-sm leading-tight font-bold text-black">
                  {CATEGORY_LABEL[t.c]}
                  <br />
                  {pct.format(share)}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <ol className="grid gap-x-10 gap-y-3 font-sans sm:grid-cols-2 lg:grid-cols-4">
        {parts.map((t) => (
          <li
            key={t.c}
            className={`share-row flex items-center gap-3 transition-opacity duration-300 ${
              focus && focus !== t.c ? 'opacity-40' : ''
            }`}
            onPointerEnter={() => setFocus(t.c)}
            onPointerLeave={() => setFocus(undefined)}
          >
            <span
              className="inline-block size-3 shrink-0 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[t.c].dark }}
              aria-hidden="true"
            />
            <span className="flex-1">{CATEGORY_LABEL[t.c]}</span>
            <span className="tabular-nums text-white/70">
              {t.n} haber, {pct.format(t.n / sum)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
