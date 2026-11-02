'use client';

import { type RefObject, useEffect, useState } from 'react';

/** Measures a container's width; falls back to `initial` for the server render. */
export function useChartWidth(ref: RefObject<HTMLElement | null>, initial = 960): number {
  const [width, setWidth] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}
