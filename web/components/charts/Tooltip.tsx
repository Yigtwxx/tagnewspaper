'use client';

import type { ReactNode } from 'react';

/** Positioned tooltip; flips to the left of the pointer near the right edge. */
export function Tooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number;
  children: ReactNode;
}) {
  const flip = x > width - 220;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-40 border border-(--line) bg-(--bg) px-3 py-2 font-sans text-sm shadow-[0_8px_30px_rgb(0_0_0/0.25)]"
      style={{
        left: flip ? undefined : x + 14,
        right: flip ? width - x + 14 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      {children}
    </div>
  );
}
