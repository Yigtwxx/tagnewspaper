'use client';

import { useGSAP } from '@gsap/react';
import { extent, max } from 'd3-array';
import { scaleLinear, scaleUtc } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { type PointerEvent, useId, useRef, useState } from 'react';

import { formatCalendarDate } from '@/lib/format';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';
import type { MarketPriceT } from '@/lib/schema';

import { Tooltip } from '../charts/Tooltip';
import { useChartWidth } from '../charts/useChartWidth';

const RANGES = [
  { key: '1A', label: '1 ay', days: 31 },
  { key: '3A', label: '3 ay', days: 92 },
  { key: '6A', label: '6 ay', days: 183 },
  { key: '1Y', label: '1 yıl', days: 366 },
] as const;
type RangeKey = (typeof RANGES)[number]['key'];

function utcDay(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const usd = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' });
const vol = new Intl.NumberFormat('tr-TR', { notation: 'compact' });

/** Daily close line with volume bars. The line draws itself in on load and on range change. */
export function StockChart({ prices }: { prices: MarketPriceT[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const width = useChartWidth(wrapRef);
  const gradId = useId().replace(/:/g, '');
  const [range, setRange] = useState<RangeKey>('6A');
  const [hover, setHover] = useState<number | undefined>(undefined);

  const lastDay = utcDay(prices[prices.length - 1].date).getTime();
  const days = RANGES.find((r) => r.key === range)?.days ?? 183;
  const data = prices.filter((p) => utcDay(p.date).getTime() >= lastDay - days * 86_400_000);
  const series = data.length >= 2 ? data : prices;

  const height = width < 640 ? 300 : 420;
  const m = { top: 20, right: 56, bottom: 30, left: 8 };
  const innerW = Math.max(10, width - m.left - m.right);
  const volH = 56;
  const priceH = height - m.top - m.bottom - volH - 12;

  const x = scaleUtc()
    .domain([utcDay(series[0].date), utcDay(series[series.length - 1].date)])
    .range([0, innerW]);
  const [lo, hi] = extent(series, (d) => d.close) as [number, number];
  const pad = (hi - lo) * 0.12 || hi * 0.05;
  const y = scaleLinear()
    .domain([lo - pad, hi + pad])
    .nice(5)
    .range([priceH, 0]);
  const yv = scaleLinear()
    .domain([0, max(series, (d) => d.volume) ?? 1])
    .range([0, volH]);

  const linePath =
    line<MarketPriceT>()
      .x((d) => x(utcDay(d.date)))
      .y((d) => y(d.close))
      .curve(curveMonotoneX)(series) ?? '';
  const areaPath =
    area<MarketPriceT>()
      .x((d) => x(utcDay(d.date)))
      .y0(priceH)
      .y1((d) => y(d.close))
      .curve(curveMonotoneX)(series) ?? '';
  const barW = Math.max(1, innerW / series.length - 1);
  const up = series[series.length - 1].close >= series[0].close;

  useGSAP(
    () => {
      if (prefersReducedMotion() || !wrapRef.current) return;
      registerGsap();
      const path = wrapRef.current.querySelector<SVGPathElement>('.price-line');
      if (!path) return;
      const len = path.getTotalLength();
      gsap.fromTo(
        path,
        { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 1.4, ease: 'power2.inOut' },
      );
      gsap.fromTo(
        wrapRef.current.querySelector('.price-area'),
        { opacity: 0 },
        { opacity: 1, duration: 1, delay: 0.6 },
      );
      gsap.from(wrapRef.current.querySelectorAll('.vol-bar'), {
        scaleY: 0,
        transformOrigin: '50% 100%',
        duration: 0.6,
        stagger: { amount: 0.6 },
        ease: 'power2.out',
      });
    },
    { scope: wrapRef, dependencies: [range, innerW] },
  );

  function onMove(evt: PointerEvent<SVGRectElement>) {
    const box = evt.currentTarget.getBoundingClientRect();
    const t = x.invert(evt.clientX - box.left).getTime();
    let best = 0;
    series.forEach((d, i) => {
      if (
        Math.abs(utcDay(d.date).getTime() - t) < Math.abs(utcDay(series[best].date).getTime() - t)
      )
        best = i;
    });
    setHover(best);
  }

  const hovered = hover !== undefined ? series[hover] : undefined;
  const ticks = x.ticks(width < 640 ? 3 : 6);

  return (
    <div>
      <div className="mb-6 flex gap-5" role="group" aria-label="Zaman aralığı">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            aria-pressed={range === r.key}
            onClick={() => setRange(r.key)}
            className={`border-b-2 pb-1 font-sans text-sm transition-colors ${
              range === r.key
                ? 'border-(--fg) font-semibold'
                : 'border-transparent text-(--mute) hover:text-(--fg)'
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <div ref={wrapRef} className="relative w-full">
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto max-w-full"
          role="img"
          aria-label={`MRT günlük kapanış fiyatı, ${RANGES.find((r) => r.key === range)?.label}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#01b251" stopOpacity="0.28" />
              <stop offset="1" stopColor="#01b251" stopOpacity="0" />
            </linearGradient>
          </defs>
          <g transform={`translate(${m.left},${m.top})`}>
            {y.ticks(5).map((t) => (
              <g key={t} transform={`translate(0,${y(t)})`}>
                <line x2={innerW} stroke="currentColor" strokeOpacity={0.1} />
                <text
                  x={innerW + 8}
                  dy="0.32em"
                  className="fill-(--mute) font-sans text-[12px] tabular-nums"
                >
                  {usd.format(t)}
                </text>
              </g>
            ))}
            <path className="price-area" d={areaPath} fill={`url(#${gradId})`} />
            <path
              className="price-line"
              d={linePath}
              fill="none"
              stroke={up ? '#01b251' : 'currentColor'}
              strokeWidth={2}
              strokeLinejoin="round"
            />
            <g transform={`translate(0,${priceH + 12})`}>
              {series.map((d) => (
                <rect
                  key={d.date}
                  className="vol-bar"
                  x={x(utcDay(d.date)) - barW / 2}
                  y={volH - yv(d.volume)}
                  width={barW}
                  height={yv(d.volume)}
                  fill="currentColor"
                  opacity={0.22}
                />
              ))}
            </g>
            {ticks.map((t) => (
              <text
                key={t.toISOString()}
                x={x(t)}
                y={priceH + volH + 30}
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
              <g transform={`translate(${x(utcDay(hovered.date))},0)`} pointerEvents="none">
                <line y2={priceH + volH + 12} stroke="currentColor" strokeOpacity={0.4} />
                <circle
                  cy={y(hovered.close)}
                  r={5}
                  fill="#01b251"
                  stroke="var(--bg)"
                  strokeWidth={2}
                />
              </g>
            )}
            <rect
              width={innerW}
              height={priceH + volH + 12}
              fill="transparent"
              onPointerMove={onMove}
              onPointerLeave={() => setHover(undefined)}
            />
          </g>
        </svg>
        {hovered && (
          <Tooltip
            x={m.left + x(utcDay(hovered.date))}
            y={m.top + y(hovered.close) - 48}
            width={width}
          >
            <p className="text-(--mute)">{formatCalendarDate(hovered.date)}</p>
            <p className="font-semibold tabular-nums">Kapanış {usd.format(hovered.close)}</p>
            <p className="text-(--mute) tabular-nums">
              Aralık {usd.format(hovered.low)} – {usd.format(hovered.high)}
            </p>
            <p className="text-(--mute) tabular-nums">Hacim {vol.format(hovered.volume)}</p>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
