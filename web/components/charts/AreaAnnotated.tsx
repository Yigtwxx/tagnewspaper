'use client';

import { useGSAP } from '@gsap/react';
import { max } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { type PointerEvent, useId, useRef, useState } from 'react';

import { formatCalendarDate } from '@/lib/format';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';

import { Tooltip } from './Tooltip';
import { useChartWidth } from './useChartWidth';

export interface DailyPoint {
  date: string;
  count: number;
}
export interface Marker {
  date: string;
  label: string;
}

const LINE = '#04a74b';
const FILL = 'rgb(1 178 81 / 0.16)';

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function AreaAnnotated({ data, markers }: { data: DailyPoint[]; markers: Marker[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useChartWidth(wrapRef);
  const clipId = useId().replace(/:/g, '');
  const [hover, setHover] = useState<number | undefined>(undefined);

  const height = width < 640 ? 260 : 340;
  const m = { top: 56, right: 12, bottom: 32, left: 36 };
  const innerW = Math.max(10, width - m.left - m.right);
  const innerH = height - m.top - m.bottom;

  const x = scaleUtc()
    .domain([utcDay(data[0].date), utcDay(data[data.length - 1].date)])
    .range([0, innerW]);
  const yMax = Math.max(4, (max(data, (d) => d.count) ?? 0) * 1.12);
  const y = scaleLinear().domain([0, yMax]).nice(4).range([innerH, 0]);

  const areaPath = area<DailyPoint>()
    .x((d) => x(utcDay(d.date)))
    .y0(innerH)
    .y1((d) => y(d.count))
    .curve(curveMonotoneX)(data);
  const linePath = line<DailyPoint>()
    .x((d) => x(utcDay(d.date)))
    .y((d) => y(d.count))
    .curve(curveMonotoneX)(data);

  const inRange = markers.filter((mk) => {
    const t = utcDay(mk.date).getTime();
    return t >= utcDay(data[0].date).getTime() && t <= utcDay(data[data.length - 1].date).getTime();
  });

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
          attr: { width: innerW + 4 },
          duration: 1.6,
          ease: 'power2.inOut',
          scrollTrigger: { trigger: wrapRef.current, start: 'top 75%', once: true },
        },
      );
    },
    { scope: wrapRef, dependencies: [innerW] },
  );

  function onMove(evt: PointerEvent<SVGRectElement>) {
    const box = evt.currentTarget.getBoundingClientRect();
    const px = evt.clientX - box.left;
    const t = x.invert(px).getTime();
    let best = 0;
    let bestDist = Infinity;
    data.forEach((d, i) => {
      const dist = Math.abs(utcDay(d.date).getTime() - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    });
    setHover(best);
  }

  const months = x.ticks(width < 640 ? 3 : 6);
  const hovered = hover !== undefined ? data[hover] : undefined;

  return (
    <div ref={wrapRef} className="relative w-full">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block h-auto max-w-full overflow-visible"
        role="img"
        aria-label="Son 90 günde günlük haber sayısı"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x={-2} y={-m.top} width={innerW + 4} height={height} />
          </clipPath>
        </defs>
        <g transform={`translate(${m.left},${m.top})`}>
          {y.ticks(4).map((t) => (
            <g key={t} transform={`translate(0,${y(t)})`}>
              <line x2={innerW} stroke="currentColor" strokeOpacity={t === 0 ? 0.6 : 0.12} />
              <text
                x={-10}
                dy="0.32em"
                textAnchor="end"
                className="fill-(--mute) font-sans text-[12px]"
              >
                {t}
              </text>
            </g>
          ))}
          {months.map((t) => (
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

          <g clipPath={`url(#${clipId})`}>
            {areaPath && <path d={areaPath} fill={FILL} />}
            {linePath && (
              <path d={linePath} fill="none" stroke={LINE} strokeWidth={2} strokeLinejoin="round" />
            )}
          </g>

          {inRange.map((mk, i) => {
            const mx = x(utcDay(mk.date));
            const row = i % 2;
            return (
              <g key={`${mk.date}-${i}`} transform={`translate(${mx},0)`}>
                <line
                  y1={-m.top + 14 + row * 18}
                  y2={innerH}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text
                  x={mx > innerW * 0.7 ? -6 : 6}
                  y={-m.top + 22 + row * 18}
                  textAnchor={mx > innerW * 0.7 ? 'end' : 'start'}
                  className="fill-(--fg) font-sans text-[12px] font-semibold"
                >
                  {formatCalendarDate(mk.date, { year: false, short: true })}: {mk.label}
                </text>
              </g>
            );
          })}

          {hovered && hover !== undefined && (
            <g transform={`translate(${x(utcDay(hovered.date))},0)`} pointerEvents="none">
              <line y2={innerH} stroke="currentColor" strokeOpacity={0.5} />
              <circle cy={y(hovered.count)} r={5} fill={LINE} stroke="var(--bg)" strokeWidth={2} />
            </g>
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
      {hovered && (
        <Tooltip
          x={m.left + x(utcDay(hovered.date))}
          y={m.top + y(hovered.count) - 40}
          width={width}
        >
          <p className="text-(--mute)">{formatCalendarDate(hovered.date)}</p>
          <p className="font-semibold">{hovered.count} haber</p>
        </Tooltip>
      )}
    </div>
  );
}
