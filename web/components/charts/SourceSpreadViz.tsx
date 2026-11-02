'use client';

import { useGSAP } from '@gsap/react';
import { hierarchy, pack } from 'd3-hierarchy';
import { useRef, useState } from 'react';

import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';

import { useChartWidth } from './useChartWidth';

export interface SourceCount {
  name: string;
  domain: string;
  count: number;
}

type Node = { children: SourceCount[] } | SourceCount;

/**
 * Ranked list and packed circles of the same outlets, linked: pointing at either one
 * highlights the other. On entering view the circles rise from below in a loose swarm,
 * spring into place while their counts tick up, then drift gently.
 */
export function SourceSpreadViz({ data }: { data: SourceCount[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<HTMLDivElement>(null);
  const width = useChartWidth(chartRef, 640);
  const size = Math.min(width, 640);
  const [active, setActive] = useState<string | undefined>(undefined);

  const leaves = pack<Node>()
    .size([size, size])
    .padding(4)(
      hierarchy<Node>({ children: data }, (d) => ('children' in d ? d.children : undefined)).sum(
        (d) => ('count' in d ? d.count : 0),
      ),
    )
    .leaves()
    .map((n) => ({ data: n.data as SourceCount, x: n.x, y: n.y, r: n.r }));

  const top = data.slice(0, 8);
  const maxCount = top[0]?.count ?? 1;

  useGSAP(
    () => {
      if (prefersReducedMotion() || !rootRef.current) return;
      registerGsap();
      const root = rootRef.current;
      const bubbles = gsap.utils.toArray<SVGGElement>('.bubble-inner', root);
      const center = size / 2;

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 70%', once: true },
      });
      bubbles.forEach((el, i) => {
        const leaf = leaves[i];
        if (!leaf) return;
        tl.fromTo(
          el,
          {
            x: (leaf.x - center) * 0.9 + gsap.utils.random(-60, 60),
            y: size * 0.75 + gsap.utils.random(0, 160),
            scale: 0.25,
            opacity: 0,
          },
          {
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            duration: 1.5,
            ease: 'elastic.out(1, 0.55)',
            transformOrigin: '50% 50%',
          },
          i * 0.07,
        );
      });

      for (const el of gsap.utils.toArray<SVGTSpanElement>('[data-count]', root)) {
        const target = Number(el.dataset.count);
        const state = { v: 0 };
        el.textContent = '0';
        tl.to(
          state,
          {
            v: target,
            duration: 1.4,
            ease: 'power2.out',
            onUpdate: () => {
              el.textContent = String(Math.round(state.v));
            },
          },
          0.3,
        );
      }

      tl.fromTo(
        gsap.utils.toArray<HTMLElement>('.src-bar', root),
        { scaleX: 0 },
        { scaleX: 1, duration: 1.1, ease: 'power3.out', stagger: 0.08 },
        0.1,
      );

      // After settling, each circle drifts a few pixels on its own slow rhythm.
      tl.add(() => {
        bubbles.forEach((el) =>
          gsap.to(el, {
            y: gsap.utils.random(-5, 5),
            x: gsap.utils.random(-3, 3),
            duration: gsap.utils.random(2.4, 3.8),
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
          }),
        );
      });
    },
    { scope: rootRef, dependencies: [size, data.length] },
  );

  return (
    <div ref={rootRef} className="grid gap-16 lg:grid-cols-12">
      <ol
        className="flex flex-col gap-3 font-sans lg:col-span-5"
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

      <div ref={chartRef} className="relative mx-auto w-full max-w-[640px] lg:col-span-7">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          className="block h-auto max-w-full overflow-visible"
          role="img"
          aria-label="Yayın organlarına göre haber sayısı; daire büyüklüğü haber sayısını gösterir"
        >
          {leaves.map((leaf) => {
            const on = active === leaf.data.domain;
            const dim = active !== undefined && !on;
            const labelled = leaf.r > 30;
            return (
              <g
                key={leaf.data.domain}
                transform={`translate(${leaf.x},${leaf.y})`}
                onPointerEnter={() => setActive(leaf.data.domain)}
                onPointerLeave={() => setActive(undefined)}
              >
                <g className="bubble-inner">
                  <circle
                    r={leaf.r}
                    fill={on ? '#000000' : '#01b251'}
                    opacity={dim ? 0.35 : 1}
                    className="transition-[fill,opacity] duration-300"
                  />
                  {labelled ? (
                    <text
                      textAnchor="middle"
                      className={`pointer-events-none font-sans ${on ? 'fill-white' : 'fill-black'}`}
                    >
                      <tspan
                        x={0}
                        dy="-0.25em"
                        fontSize={Math.min(17, leaf.r / 3.2)}
                        fontWeight={700}
                      >
                        {leaf.data.name.length > 16
                          ? `${leaf.data.name.slice(0, 15)}…`
                          : leaf.data.name}
                      </tspan>
                      <tspan
                        x={0}
                        dy="1.35em"
                        fontSize={Math.min(15, leaf.r / 3.6)}
                        data-count={leaf.data.count}
                      >
                        {leaf.data.count}
                      </tspan>
                    </text>
                  ) : (
                    <title>{`${leaf.data.name}: ${leaf.data.count} haber`}</title>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
