import { describe, expect, it } from 'vitest';

import { DRUM, drumPath } from '@/components/hero/FlapCell';
import { coverSpec, hash32 } from '@/lib/cover';
import { decodeCursor, encodeCursor } from '@/lib/cursor';
import { fitCells, formatCompact, formatTime, issueNumber, trUpper } from '@/lib/format';

describe('format', () => {
  it('uppercases Turkish correctly', () => {
    expect(trUpper('istinaf ılık')).toBe('İSTİNAF ILIK');
  });

  it('pins times to Europe/Istanbul', () => {
    expect(formatTime('2026-11-01T19:28:00Z')).toBe('22:28');
  });

  it('formats compact Turkish figures', () => {
    expect(formatCompact(4_900_000)).toEqual({ value: '4,9', unit: 'milyon' });
    expect(formatCompact(584_000)).toEqual({ value: '584', unit: 'bin' });
  });

  it('fits split-flap rows to an exact width', () => {
    expect(fitCells('kısa', 6)).toBe('KISA  ');
    expect(fitCells('çok uzun bir başlık', 8)).toBe('ÇOK UZUN');
  });

  it('counts issues from launch day', () => {
    expect(issueNumber('2026-11-02T09:00:00Z')).toBe(1);
    expect(issueNumber('2026-11-12T09:00:00Z')).toBe(11);
  });
});

describe('cursor', () => {
  it('round-trips', () => {
    const raw = encodeCursor('2026-11-01T19:28:00.000Z', '00000000000000ab');
    expect(decodeCursor(raw)).toEqual({
      publishedAt: '2026-11-01T19:28:00.000Z',
      id: '00000000000000ab',
    });
  });

  it('rejects junk', () => {
    expect(decodeCursor('nope')).toBeUndefined();
    expect(decodeCursor('2026-11-01T19:28:00Z|{"$gt":""}')).toBeUndefined();
    expect(decodeCursor('not-a-date|00000000000000ab')).toBeUndefined();
  });
});

describe('cover', () => {
  it('is deterministic per id', () => {
    expect(coverSpec('abc')).toEqual(coverSpec('abc'));
    expect(hash32('abc')).not.toBe(hash32('abd'));
  });

  it('keeps route points inside the frame', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e']) {
      for (const [x, y] of coverSpec(id).points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(100);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(56);
      }
    }
  });
});

describe('split-flap drum', () => {
  it('always lands on the target glyph', () => {
    for (const [from, to] of [
      ['A', 'Z'],
      [' ', 'Ş'],
      ['9', 'A'],
      ['İ', 'İ'],
    ]) {
      const path = drumPath(from, to, 3);
      expect(path.at(-1)).toBe(to);
      expect(path.length).toBeLessThanOrEqual(9);
    }
  });

  it('does nothing when already showing the target', () => {
    expect(drumPath('K', 'K')).toEqual([]);
  });

  it('includes Turkish letters on the drum', () => {
    for (const ch of 'ÇĞİÖŞÜ') expect(DRUM).toContain(ch);
  });
});
