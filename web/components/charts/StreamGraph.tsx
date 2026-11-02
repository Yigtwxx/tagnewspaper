'use client';

import { useGSAP } from '@gsap/react';
import { scaleLinear, scaleUtc } from 'd3-scale';
import {
  area,
  curveCatmullRom,
  type Series,
  stack,
  stackOffsetWiggle,
  stackOrderNone,
} from 'd3-shape';
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
type Layer = Series<Row, CategoryT>;

const DIRECT_LABELS = 3;

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Weekly topic stream. Layers keep a fixed category order (validated color adjacency).
 * On entering view the stream "blooms" open from its centre line, one layer after another;
 * hovering the legend or a layer brings that topic forward and dims the rest.
 */
export function StreamGraph({ data }: { data: WeekCounts[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const pathRefs = useRef<Array<SVGPathElement | null>>([]);
  const width = useChartWidth(wrapRef);
  const clipId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | undefined>(undefined);
  const [focus, setFocus] = useState<CategoryT | undefined>(undefined);

  const height = width < 640 ? 300 : 440;
  const m = { top: 16, right: 8, bottom: 30, left: 8 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const rows: Row[] = data.map((w) => {
    const row = { t: utcDay(w.week_start).getTime() } as Row;
    for (const c of CATEGORIES) row[c] = w.counts[c] ?? 0;
    return row;
  });
  const series: Layer[] = stack<Row, CategoryT>()
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

  // Centre line of the whole stack per week: the layers bloom out of it.
  const mid = rows.map((_, i) => (y(series[0][i][0]) + y(series[series.length - 1][i][1])) / 2);

  const pathAt = (layer: Layer, t: number): string =>
    area<[number, number]>()
      .x((_, i) => x(new Date(rows[i].t)))
      .y0((d, i) => mid[i] + (y(d[0]) - mid[i]) * t)
      .y1((d, i) => mid[i] + (y(d[1]) - mid[i]) * t)
      .curve(curveCatmullRom.alpha(0.5))(layer as unknown as Array<[number, number]>) ?? '';

  // Direct labels for the biggest topics, placed where each layer is thickest.
  const totals = series.map((s) => s.reduce((sum, [a, b]) => sum + (b - a), 0));
  const labelled = [...series.keys()].sort((a, b) => totals[b] - totals[a]).slice(0, DIRECT_LABELS);
  const labels = labelled
    .map((li) => {
      const layer = series[li];
      let best = 0;
      layer.forEach(([a, b], i) => {
        if (b - a > layer[best][1] - layer[best][0]) best = i;
      });
      const [a, b] = layer[best];
      const thickness = y(a) - y(b);
      return {
        key: layer.key,
        x: Math.min(Math.max(x(new Date(rows[best].t)), 70), innerW - 70),
        y: (y(a) + y(b)) / 2,
        show: thickness > 22,
      };
    })
    .filter((l) => l.show);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !wrapRef.current) return;
      registerGsap();
      const els = pathRefs.current;
      series.forEach((layer, i) => els[i]?.setAttribute('d', pathAt(layer, 0)));
      gsap.set(wrapRef.current.querySelectorAll('.stream-label'), { opacity: 0 });

      const tl = gsap.timeline({
        scrollTrigger: { trigger: wrapRef.current, start: 'top 75%', once: true },
      });
      // Inner layers open first, so the stream unfolds from its middle outwards.
      const order = [...series.keys()].sort(
        (a, b) => Math.abs(a - (series.length - 1) / 2) - Math.abs(b - (series.length - 1) / 2),
      );
      order.forEach((li, k) => {
        const state = { t: 0 };
        tl.to(
          state,
          {
            t: 1,
            duration: 1.3,
            ease: 'expo.out',
            onUpdate: () => els[li]?.setAttribute('d', pathAt(series[li], state.t)),
          },
          k * 0.09,
        );
      });
      tl.to(
        wrapRef.current.querySelectorAll('.stream-label'),
        { opacity: 1, y: 0, duration: 0.5, stagger: 0.1, ease: 'power2.out' },
        '-=0.4',
      );
    },
    { scope: wrapRef, dependencies: [innerW, data.length] },
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
      <ul className="mb-8 flex flex-wrap gap-x-2 gap-y-2 font-sans text-sm" aria-label="Konular">
        {CATEGORIES.map((c, i) => (
          <li key={c}>
            <button
              type="button"
              aria-pressed={focus === c}
              onPointerEnter={() => setFocus(c)}
              onPointerLeave={() => setFocus(undefined)}
              onFocus={() => setFocus(c)}
              onBlur={() => setFocus(undefined)}
              onClick={() => setFocus((f) => (f === c ? undefined : c))}
              className={`flex items-center gap-2 border px-3 py-1.5 transition-[opacity,border-color] duration-300 ${
                focus && focus !== c ? 'border-transparent opacity-40' : 'border-white/25'
              }`}
            >
              <span
                className="inline-block size-3 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[c].dark }}
                aria-hidden="true"
              />
              {CATEGORY_LABEL[c]}
              <span className="text-white/60 tabular-nums">{Math.round(totals[i])}</span>
            </button>
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
              {series.map((s, i) => (
                <path
                  key={s.key}
                  ref={(el) => {
                    pathRefs.current[i] = el;
                  }}
                  d={pathAt(s, 1)}
                  fill={CATEGORY_COLOR[s.key].dark}
                  stroke={CATEGORY_COLOR[s.key].dark}
                  strokeWidth={0.8}
                  strokeLinejoin="round"
                  className="transition-opacity duration-300"
                  opacity={focus && focus !== s.key ? 0.18 : 1}
                  onPointerEnter={() => setFocus(s.key)}
                  onPointerLeave={() => setFocus(undefined)}
                />
              ))}
            </g>
            {labels.map((l) => (
              <text
                key={l.key}
                x={l.x}
                y={l.y}
                dy="0.35em"
                textAnchor="middle"
                className="stream-label pointer-events-none fill-white font-sans text-[13px] font-bold"
                stroke="#000"
                strokeWidth={3}
                paintOrder="stroke"
                opacity={focus && focus !== l.key ? 0.2 : 1}
              >
                {CATEGORY_LABEL[l.key]}
              </text>
            ))}
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
                <li
                  key={c}
                  className={`flex items-center justify-between gap-4 ${focus && focus !== c ? 'opacity-40' : ''}`}
                >
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
