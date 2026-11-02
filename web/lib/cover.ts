/**
 * Deterministic generative covers. No publisher images are ever shown (copyright),
 * so each article gets an abstract print-inspired composition seeded by its id.
 */

export type CoverKind = 'halftone' | 'bands' | 'route';

export interface CoverSpec {
  kind: CoverKind;
  /** Halftone: focal point in % of the box. */
  cx: number;
  cy: number;
  /** Bands: angle in degrees and band widths (sum normalised to 100). */
  angle: number;
  bands: number[];
  /** Route: polyline points in a 0..100 x 0..56 box. */
  points: Array<[number, number]>;
}

/** FNV-1a 32-bit — tiny, stable across runtimes. */
export function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG seeded from the id hash. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KINDS: CoverKind[] = ['halftone', 'bands', 'route'];

export function coverSpec(id: string): CoverSpec {
  const seed = hash32(id);
  const rand = rng(seed);
  const kind = KINDS[seed % KINDS.length];

  const raw = Array.from({ length: 5 }, () => 4 + rand() * 18);
  const total = raw.reduce((a, b) => a + b, 0);
  const bands = raw.map((w) => (w / total) * 100);

  const points: Array<[number, number]> = [];
  let x = 4;
  let y = 8 + rand() * 40;
  points.push([x, y]);
  while (x < 92) {
    // Manhattan-style legs read as a journey across a grid, not a specific map.
    if (rand() > 0.5) x = Math.min(96, x + 10 + rand() * 22);
    else y = Math.min(50, Math.max(6, y + (rand() - 0.5) * 34));
    points.push([Number(x.toFixed(1)), Number(y.toFixed(1))]);
  }

  return {
    kind,
    cx: Math.round(15 + rand() * 70),
    cy: Math.round(15 + rand() * 70),
    angle: Math.round(-35 + rand() * 70),
    bands,
    points,
  };
}
