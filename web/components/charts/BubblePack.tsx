'use client';

import { useGSAP } from '@gsap/react';
import { hierarchy, pack } from 'd3-hierarchy';
import { useRef, useState } from 'react';

import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';

import { Tooltip } from './Tooltip';
import { useChartWidth } from './useChartWidth';

export interface SourceCount {
  name: string;
  domain: string;
  count: number;
}

interface Leaf {
  data: SourceCount;
  x: number;
  y: number;
  r: number;
}

/** Packed circles, area ∝ article count. Single hue: magnitude lives in size, not color. */
export function BubblePack({ data }: { data: SourceCount[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useChartWidth(wrapRef, 640);
  const size = Math.min(width, 640);
  const [hover, setHover] = useState<Leaf | undefined>(undefined);

  const root = hierarchy<{ children: SourceCount[] } | SourceCount>({ children: data }, (d) =>
    'children' in d ? d.children : undefined,
  ).sum((d) => ('count' in d ? d.count : 0));
  const leaves = pack<{ children: SourceCount[] } | SourceCount>()
    .size([size, size])
    .padding(3)(root)
    .leaves()
    .map((n) => ({ data: n.data as SourceCount, x: n.x, y: n.y, r: n.r }));

  useGSAP(
    () => {
      if (prefersReducedMotion() || !wrapRef.current) return;
      registerGsap();
      gsap.from(wrapRef.current.querySelectorAll('.bubble'), {
        scale: 0,
        transformOrigin: '50% 50%',
        duration: 0.7,
        ease: 'back.out(1.6)',
        stagger: { amount: 0.8, from: 'center' },
        scrollTrigger: { trigger: wrapRef.current, start: 'top 75%', once: true },
      });
    },
    { scope: wrapRef, dependencies: [size] },
  );

  return (
    <div ref={wrapRef} className="relative mx-auto w-full max-w-[640px]">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="block h-auto max-w-full"
        role="img"
        aria-label="Yayın organlarına göre haber sayısı"
      >
        {leaves.map((leaf) => {
          const active = hover?.data.domain === leaf.data.domain;
          const labelled = leaf.r > 30;
          return (
            <g
              key={leaf.data.domain}
              className="bubble"
              transform={`translate(${leaf.x},${leaf.y})`}
              onPointerEnter={() => setHover(leaf)}
              onPointerLeave={() => setHover(undefined)}
            >
              <circle
                r={leaf.r}
                fill={active ? '#000000' : '#01b251'}
                stroke="#ffffff"
                strokeWidth={2}
                className="transition-[fill] duration-200"
              />
              {labelled && (
                <text
                  textAnchor="middle"
                  className={`pointer-events-none font-sans ${active ? 'fill-white' : 'fill-black'}`}
                >
                  <tspan x={0} dy="-0.2em" fontSize={Math.min(16, leaf.r / 3.4)} fontWeight={600}>
                    {leaf.data.name.length > 16
                      ? `${leaf.data.name.slice(0, 15)}…`
                      : leaf.data.name}
                  </tspan>
                  <tspan x={0} dy="1.3em" fontSize={Math.min(14, leaf.r / 3.8)}>
                    {leaf.data.count}
                  </tspan>
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tooltip x={hover.x * (Math.min(width, 640) / size)} y={hover.y - hover.r} width={size}>
          <p className="font-semibold">{hover.data.name}</p>
          <p className="text-(--mute)">{hover.data.count} haber</p>
        </Tooltip>
      )}
    </div>
  );
}
