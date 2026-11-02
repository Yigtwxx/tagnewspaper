'use client';

import { useGSAP } from '@gsap/react';
import { useRef, useState } from 'react';

import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';

export interface SourceCount {
  name: string;
  domain: string;
  count: number;
}

const MIN_REM = 1.05;
const MAX_REM = 3.1;
const HIGHLIGHT = 3;

/**
 * Ranked list and a "name wall" of the same outlets, linked: pointing at either one
 * highlights the other. Each name is set in a size proportional to its story count, the
 * way a newsstand shows the big mastheads first; names rise into place, largest first.
 */
export function SourceSpreadViz({ data }: { data: SourceCount[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | undefined>(undefined);

  const top = data.slice(0, 8);
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const minCount = Math.min(maxCount, ...data.map((d) => d.count));
  const sizeOf = (n: number) =>
    maxCount === minCount
      ? MIN_REM + (MAX_REM - MIN_REM) / 2
      : MIN_REM + (MAX_REM - MIN_REM) * Math.sqrt((n - minCount) / (maxCount - minCount));
  // Alphabetical order mixes sizes across the wall instead of a big-to-small slope.
  const wall = [...data].sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  const rank = new Map(data.map((d, i) => [d.domain, i]));

  useGSAP(
    () => {
      if (prefersReducedMotion() || !rootRef.current) return;
      registerGsap();
      const root = rootRef.current;
      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 88%', once: true },
      });
      const words = gsap.utils
        .toArray<HTMLElement>('.wall-word', root)
        .sort((a, b) => Number(a.dataset.rank) - Number(b.dataset.rank));
      tl.from(words, {
        yPercent: 115,
        duration: 0.8,
        ease: 'power4.out',
        stagger: { each: 0.035 },
      });
      tl.from(
        gsap.utils.toArray<HTMLElement>('.wall-count', root),
        { opacity: 0, duration: 0.4, stagger: 0.02 },
        '-=0.4',
      );
      tl.fromTo(
        gsap.utils.toArray<HTMLElement>('.src-bar', root),
        { scaleX: 0 },
        { scaleX: 1, duration: 1, ease: 'power3.out', stagger: 0.07 },
        0,
      );
    },
    { scope: rootRef, dependencies: [data.length] },
  );

  return (
    <div ref={rootRef} className="grid gap-14 lg:grid-cols-12">
      <ol
        className="flex flex-col gap-3 font-sans lg:col-span-4"
        aria-label="En çok haber yapan yayın organları"
      >
        {top.map((s, i) => {
          const on = active === s.domain;
          return (
            <li
              key={s.domain}
              className={`grid cursor-default grid-cols-[1.5rem_1fr_auto] items-center gap-3 transition-opacity duration-300 ${
                active && !on ? 'opacity-45' : ''
              }`}
              onPointerEnter={() => setActive(s.domain)}
              onPointerLeave={() => setActive(undefined)}
            >
              <span className="text-sm text-(--mute) tabular-nums">{i + 1}</span>
              <span className="relative pb-1.5">
                <span className={`relative z-10 ${on ? 'font-semibold' : ''}`}>{s.name}</span>
                <span
                  className={`src-bar absolute bottom-0 left-0 h-[3px] origin-left transition-colors ${on ? 'bg-black' : 'bg-tag'}`}
                  style={{ width: `${(s.count / maxCount) * 100}%` }}
                  aria-hidden="true"
                />
              </span>
              <span className="text-sm tabular-nums">{s.count}</span>
            </li>
          );
        })}
      </ol>

      <ul
        className="flex flex-wrap items-baseline gap-x-6 gap-y-3 lg:col-span-8"
        aria-label="Haber yapan bütün yayın organları"
      >
        {wall.map((s) => {
          const r = rank.get(s.domain) ?? 99;
          const on = active === s.domain;
          const lead = r < HIGHLIGHT;
          return (
            <li
              key={s.domain}
              className={`inline-flex cursor-default items-baseline gap-1 overflow-hidden pb-[0.12em] transition-opacity duration-300 ${
                active && !on ? 'opacity-25' : ''
              }`}
              onPointerEnter={() => setActive(s.domain)}
              onPointerLeave={() => setActive(undefined)}
            >
              <span
                className={`wall-word inline-block font-serif leading-[1.05] font-bold ${
                  lead || on ? 'text-tag-ink' : ''
                } ${on ? 'underline decoration-2 underline-offset-4' : ''}`}
                data-rank={r}
                style={{ fontSize: `${sizeOf(s.count)}rem` }}
              >
                {s.name}
              </span>
              <sup className="wall-count meta tabular-nums">{s.count}</sup>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
