import type { ReactNode } from 'react';

import { coverSpec } from '@/lib/cover';
import { CATEGORY_COLOR } from '@/lib/labels';
import type { CategoryT } from '@/lib/schema';

/**
 * Abstract print-inspired artwork per article. Never a publisher photo (copyright).
 * Purely decorative, so it is hidden from assistive tech.
 */
export function GenerativeCover({
  id,
  category,
  className = '',
}: {
  id: string;
  category: CategoryT;
  className?: string;
}) {
  const spec = coverSpec(id);
  const color = CATEGORY_COLOR[category].light;
  const pid = `c${id}`;

  return (
    <svg
      viewBox="0 0 100 56"
      preserveAspectRatio="xMidYMid slice"
      className={`block w-full bg-black ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${pid}-dots`} width="2.4" height="2.4" patternUnits="userSpaceOnUse">
          <circle cx="1.2" cy="1.2" r="0.85" fill={color} />
        </pattern>
        <radialGradient id={`${pid}-fade`} cx={`${spec.cx}%`} cy={`${spec.cy}%`} r="70%">
          <stop offset="0" stopColor="#fff" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <mask id={`${pid}-mask`}>
          <rect width="100" height="56" fill={`url(#${pid}-fade)`} />
        </mask>
      </defs>

      {spec.kind === 'halftone' && (
        <>
          <rect width="100" height="56" fill={`url(#${pid}-dots)`} mask={`url(#${pid}-mask)`} />
          <circle cx={spec.cx} cy={(spec.cy / 100) * 56} r="9" fill={color} />
        </>
      )}

      {spec.kind === 'bands' && (
        <g transform={`rotate(${spec.angle} 50 28)`}>
          {
            spec.bands.reduce<{ x: number; els: ReactNode[] }>(
              (acc, w, i) => {
                acc.els.push(
                  <rect
                    key={i}
                    x={-40 + acc.x * 1.8}
                    y="-60"
                    width={w * 1.8}
                    height="180"
                    fill={i % 2 === 0 ? color : `url(#${pid}-dots)`}
                  />,
                );
                acc.x += w;
                return acc;
              },
              { x: 0, els: [] },
            ).els
          }
        </g>
      )}

      {spec.kind === 'route' && (
        <>
          <rect width="100" height="56" fill={`url(#${pid}-dots)`} opacity="0.35" />
          <polyline
            points={spec.points.map(([x, y]) => `${x},${y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="3.2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {spec.points.map(([x, y], i) => (
            <circle
              key={i}
              cx={x}
              cy={y}
              r={i === 0 || i === spec.points.length - 1 ? 2.6 : 1.3}
              fill={i === spec.points.length - 1 ? '#fff' : '#000'}
              stroke={color}
              strokeWidth="1"
            />
          ))}
        </>
      )}
    </svg>
  );
}
