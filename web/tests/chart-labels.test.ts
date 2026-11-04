import { describe, expect, it } from 'vitest';

import { placeMarkerLabels } from '@/lib/chart-labels';

const OPTS = { minX: -36, maxX: 322, charW: 6.4, pad: 6, gap: 8, maxRows: 4 };

function extent(p: { x: number; text: string; anchor: 'start' | 'end' }): [number, number] {
  const w = p.text.length * OPTS.charW;
  return p.anchor === 'start' ? [p.x, p.x + OPTS.pad + w] : [p.x - OPTS.pad - w, p.x];
}

describe('placeMarkerLabels', () => {
  it('puts a label right of its marker when it fits', () => {
    const [p] = placeMarkerLabels([{ x: 20, text: '1 Eki: Karar' }], OPTS);
    expect(p).toMatchObject({ anchor: 'start', text: '1 Eki: Karar', row: 0 });
  });

  it('flips a label left of its marker near the right edge', () => {
    const [p] = placeMarkerLabels([{ x: 300, text: '1 Eki: Karar açıklandı' }], OPTS);
    expect(p.anchor).toBe('end');
    expect(p.text).toBe('1 Eki: Karar açıklandı');
  });

  it('shortens a label that fits on neither side and keeps it inside the chart', () => {
    const text = '1 Eki: TŞOF Başkanı: İcra dairesi, T…';
    const [p] = placeMarkerLabels([{ x: 186, text }], OPTS);
    expect(p.text.endsWith('…')).toBe(true);
    expect(p.text.length).toBeLessThan(text.length);
    const [a, b] = extent(p);
    expect(a).toBeGreaterThanOrEqual(OPTS.minX);
    expect(b).toBeLessThanOrEqual(OPTS.maxX);
  });

  it('keeps every label inside the chart on a narrow screen', () => {
    const markers = [10, 80, 150, 186, 240, 300].map((x, i) => ({
      x,
      text: `${i + 1} Eki: Uzun bir dava gelişmesi başlığı`,
    }));
    for (const p of placeMarkerLabels(markers, OPTS)) {
      const [a, b] = extent(p);
      expect(a).toBeGreaterThanOrEqual(OPTS.minX);
      expect(b).toBeLessThanOrEqual(OPTS.maxX);
    }
  });

  it('stacks overlapping labels into separate rows', () => {
    const placed = placeMarkerLabels(
      [
        { x: 20, text: '1 Eki: İlk' },
        { x: 40, text: '2 Eki: İkinci' },
        { x: 250, text: '9 Eki: Son' },
      ],
      OPTS,
    );
    expect(placed.map((p) => p.row)).toEqual([0, 1, 0]);
  });

  it('returns labels in marker order', () => {
    const placed = placeMarkerLabels(
      [
        { x: 200, text: 'B' },
        { x: 10, text: 'A' },
      ],
      OPTS,
    );
    expect(placed.map((p) => p.text)).toEqual(['B', 'A']);
  });
});
