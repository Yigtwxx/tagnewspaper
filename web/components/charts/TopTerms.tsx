'use client';

import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';

export interface Term {
  term: string;
  count: number;
}

/** The words headlines keep returning to, sized by how many stories used them. */
export function TopTerms({ terms }: { terms: Term[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const max = Math.max(1, ...terms.map((t) => t.count));
  const min = Math.min(max, ...terms.map((t) => t.count));

  useGSAP(
    () => {
      if (prefersReducedMotion() || !ref.current) return;
      registerGsap();
      const words = ref.current.querySelectorAll('.term');
      gsap.from(words, {
        opacity: 0,
        yPercent: 60,
        rotateX: -70,
        transformOrigin: '50% 100%',
        duration: 0.8,
        ease: 'back.out(1.7)',
        stagger: { each: 0.06, from: 'random' },
        scrollTrigger: { trigger: ref.current, start: 'top 95%', once: true },
      });
    },
    { scope: ref },
  );

  if (terms.length === 0) return null;

  return (
    <div ref={ref} className="mt-16 border-t border-white/20 pt-8 [perspective:600px]">
      <h3 className="kicker mb-5 text-white/70">Son 30 günün başlıklarında öne çıkan kelimeler</h3>
      <ul className="flex flex-wrap items-baseline gap-x-7 gap-y-3">
        {terms.map((t) => {
          const k = max === min ? 1 : (t.count - min) / (max - min);
          return (
            <li key={t.term} className="term inline-flex items-baseline gap-1.5">
              <span
                className="font-serif leading-none font-bold text-tag"
                style={{ fontSize: `${1.15 + k * 1.9}rem` }}
              >
                {t.term.toLocaleLowerCase('tr-TR')}
              </span>
              <span className="meta text-white/55 tabular-nums">{t.count}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
