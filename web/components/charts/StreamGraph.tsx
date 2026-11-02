'use client';

import { useGSAP } from '@gsap/react';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area, curveCatmullRom, stack, stackOffsetWiggle, stackOrderNone } from 'd3-shape';
import { type PointerEvent, useId, useRef, useState } from 'react';

import { formatCalendarDate } from '@/lib/format';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/labels';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';
import { CATEGORIES, type CategoryT } from '@/lib/schema';

import { Tooltip } from './Tooltip';
import { useChartWidth } from './useChartWidth';

export interface WeekCounts {
  week_start: string;
  counts: Partial<Record<CategoryT, number>>;
}

type Row = Record<CategoryT, number> & { t: number };

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Weekly topic stream. Fixed category order keeps validated color adjacency. */
export function StreamGraph({ data }: { data: WeekCounts[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useChartWidth(wrapRef);
  const clipId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | undefined>(undefined);

  const height = width < 640 ? 280 : 400;
  const m = { top: 12, right: 8, bottom: 30, left: 8 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const rows: Row[] = data.map((w) => {
    const row = { t: utcDay(w.week_start).getTime() } as Row;
    for (const c of CATEGORIES) row[c] = w.counts[c] ?? 0;
    return row;
  });
  const series = stack<Row, CategoryT>()
    .keys(CATEGORIES)
    .order(stackOrderNone)
    .offset(stackOffsetWiggle)(rows);

  let lo = 0;
  let hi = 1;
  for (const s of series)
    for (const [a, b] of s) {
      lo = Math.min(lo, a);
      hi = Math.max(hi, b);
    }

  const x = scaleUtc()
    .domain([new Date(rows[0].t), new Date(rows[rows.length - 1].t)])
    .range([0, innerW]);
  const y = scaleLinear().domain([lo, hi]).range([innerH, 0]);
  const shape = area<[number, number] & { data: Row }>()
    .x((d) => x(new Date(d.data.t)))
    .y0((d) => y(d[0]))
    .y1((d) => y(d[1]))
    .curve(curveCatmullRom.alpha(0.5));

  useGSAP(
    () => {
      if (prefersReducedMotion() || !wrapRef.current) return;
      registerGsap();
      const rect = wrapRef.current.querySelector(`#${clipId} rect`);
      if (!rect) return;
      gsap.fromTo(
        rect,
        { attr: { width: 0 } },
        {
          attr: { width: innerW },
          ease: 'none',
          scrollTrigger: {
            trigger: wrapRef.current,
            start: 'top 85%',
            end: 'center 45%',
            scrub: 0.8,
          },
        },
      );
    },
    { scope: wrapRef, dependencies: [innerW] },
  );

  function onMove(evt: PointerEvent<SVGRectElement>) {
    const box = evt.currentTarget.getBoundingClientRect();
    const t = x.invert(evt.clientX - box.left).getTime();
    let best = 0;
    rows.forEach((r, i) => {
      if (Math.abs(r.t - t) < Math.abs(rows[best].t - t)) best = i;
    });
    setHover(best);
  }

  const ticks = x.ticks(width < 640 ? 3 : 6);
  const hovered = hover !== undefined ? rows[hover] : undefined;

  return (
    <div>
      <ul className="mb-8 flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm" aria-label="Konular">
        {CATEGORIES.map((c) => (
          <li key={c} className="flex items-center gap-2">
            <span
              className="inline-block size-3 rounded-full"
              style={{ backgroundColor: CATEGORY_COLOR[c].dark }}
              aria-hidden="true"
            />
            {CATEGORY_LABEL[c]}
          </li>
        ))}
      </ul>
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto max-w-full"
          role="img"
          aria-label="Haftalara göre konuların haber sayısı"
        >
          <defs>
            <clipPath id={clipId}>
              <rect x={0} y={-10} width={innerW} height={innerH + 20} />
            </clipPath>
          </defs>
          <g transform={`translate(${m.left},${m.top})`}>
            <g clipPath={`url(#${clipId})`}>
              {series.map((s) => (
                <path
                  key={s.key}
                  d={shape(s as unknown as Array<[number, number] & { data: Row }>) ?? undefined}
                  fill={CATEGORY_COLOR[s.key].dark}
                  stroke="#000"
                  strokeWidth={1}
                  opacity={hover === undefined ? 1 : 0.92}
                />
              ))}
            </g>
            {ticks.map((t) => (
              <text
                key={t.toISOString()}
                x={x(t)}
                y={innerH + 22}
                textAnchor="middle"
                className="fill-(--mute) font-sans text-[12px]"
              >
                {new Intl.DateTimeFormat('tr-TR', {
                  day: 'numeric',
                  month: 'short',
                  timeZone: 'UTC',
                }).format(t)}
              </text>
            ))}
            {hovered && (
              <line
                x1={x(new Date(hovered.t))}
                x2={x(new Date(hovered.t))}
                y2={innerH}
                stroke="#fff"
                strokeOpacity={0.8}
                pointerEvents="none"
              />
            )}
            <rect
              width={innerW}
              height={innerH}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(undefined)}
            />
          </g>
        </svg>
        {hovered && hover !== undefined && (
          <Tooltip x={m.left + x(new Date(hovered.t))} y={m.top + 8} width={width}>
            <p className="mb-1 text-(--mute)">
              {formatCalendarDate(data[hover].week_start, { year: false })} haftası
            </p>
            <ul className="flex flex-col gap-0.5">
              {CATEGORIES.map((c) => (
                <li key={c} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block size-2 rounded-full"
                      style={{ backgroundColor: CATEGORY_COLOR[c].dark }}
                      aria-hidden="true"
                    />
                    {CATEGORY_LABEL[c]}
                  </span>
                  <span className="tabular-nums">{hovered[c]}</span>
                </li>
              ))}
            </ul>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
