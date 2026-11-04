import type { ReactNode } from 'react';

import { ACCENT_TILE, coverSpec } from '@/lib/cover';

const CELL = 2.4;
const DOT_R = 0.85;
const TAG_GREEN = '#01b251';

/**
 * Abstract black-and-white print artwork per article (halftone dots, bands, routes), with a
 * few dots printed in TAG green. Never a publisher photo (copyright). Purely decorative,
 * hidden from assistive tech.
 */
export function GenerativeCover({ id, className = '' }: { id: string; className?: string }) {
  const spec = coverSpec(id);
  const color = '#111111';
  const pid = `c${id}`;
  const dots = `url(#${pid}-dots)`;
  const accent = `url(#${pid}-accent)`;

  return (
    <svg
      viewBox="0 0 100 56"
      preserveAspectRatio="xMidYMid slice"
      className={`block w-full bg-[#e8e6e1] ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern id={`${pid}-dots`} width={CELL} height={CELL} patternUnits="userSpaceOnUse">
          <circle cx={CELL / 2} cy={CELL / 2} r={DOT_R} fill={color} />
        </pattern>
        {/* Same grid as the dots, so each green dot sits exactly on a black one. */}
        <pattern
          id={`${pid}-accent`}
          width={CELL * ACCENT_TILE}
          height={CELL * ACCENT_TILE}
          patternUnits="userSpaceOnUse"
        >
          {spec.accents.map(([col, row]) => (
            <circle
              key={`${col}-${row}`}
              cx={col * CELL + CELL / 2}
              cy={row * CELL + CELL / 2}
              r={DOT_R}
              fill={TAG_GREEN}
            />
          ))}
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
          <rect width="100" height="56" fill={dots} mask={`url(#${pid}-mask)`} />
          <rect width="100" height="56" fill={accent} mask={`url(#${pid}-mask)`} />
          <circle cx={spec.cx} cy={(spec.cy / 100) * 56} r="9" fill={color} />
        </>
      )}

      {spec.kind === 'bands' && (
        <g transform={`rotate(${spec.angle} 50 28)`}>
          {
            spec.bands.reduce<{ x: number; els: ReactNode[] }>(
              (acc, w, i) => {
                const band = { x: -40 + acc.x * 1.8, y: -60, width: w * 1.8, height: 180 };
                if (i % 2 === 0) {
                  acc.els.push(<rect key={i} {...band} fill={color} />);
                } else {
                  acc.els.push(<rect key={i} {...band} fill={dots} />);
                  acc.els.push(<rect key={`${i}-accent`} {...band} fill={accent} />);
                }
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
          <rect width="100" height="56" fill={dots} opacity="0.35" />
          <rect width="100" height="56" fill={accent} opacity="0.35" />
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
              fill={i === spec.points.length - 1 ? '#01b251' : '#e8e6e1'}
              stroke={color}
              strokeWidth="1"
            />
          ))}
        </>
      )}
    </svg>
  );
}
