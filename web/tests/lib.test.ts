import { describe, expect, it } from 'vitest';

import { DRUM, drumPath } from '@/components/hero/FlapCell';
import { caseOverview, splitSentences } from '@/lib/case';
import { coverSpec, hash32 } from '@/lib/cover';
import { decodeCursor, encodeCursor } from '@/lib/cursor';
import { trimLeadingEmpty } from '@/lib/series';
import {
  coverageSince,
  editionStart,
  formatCompact,
  formatTime,
  issueNumber,
  trUpper,
} from '@/lib/format';
import type { CaseEventT } from '@/lib/schema';

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

  it('starts a new issue every day at 11:00 Istanbul', () => {
    expect(issueNumber('2026-11-02T09:00:00Z')).toBe(1);
    expect(issueNumber('2026-11-03T07:59:00Z')).toBe(1);
    expect(issueNumber('2026-11-03T08:00:00Z')).toBe(2);
    expect(issueNumber('2026-11-12T09:00:00Z')).toBe(11);
  });

  it('dates an edition by its 11:00 start', () => {
    expect(editionStart('2026-11-03T07:00:00Z')).toBe('2026-11-02T08:00:00.000Z');
    expect(editionStart('2026-11-03T15:00:00Z')).toBe('2026-11-03T08:00:00.000Z');
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

describe('trimLeadingEmpty', () => {
  const rows = [0, 0, 0, 0, 0, 3, 0, 5, 2].map((count, i) => ({ i, count }));
  const empty = (r: { count: number }) => r.count === 0;

  it('starts at the first non-empty point, keeping the lead-in pad', () => {
    expect(trimLeadingEmpty(rows, empty, 2, 1).map((r) => r.i)).toEqual([4, 5, 6, 7, 8]);
  });

  it('keeps at least minLen points', () => {
    expect(trimLeadingEmpty(rows, empty, 7, 0)).toHaveLength(7);
  });

  it('falls back to the tail when everything is empty', () => {
    expect(
      trimLeadingEmpty(
        rows.map((r) => ({ ...r, count: 0 })),
        empty,
        3,
      ),
    ).toHaveLength(3);
  });
});

describe('case overview', () => {
  const event = (id: string, date: string, type: CaseEventT['type']): CaseEventT => ({
    id,
    date,
    type,
    title: id,
    description: '',
    court: null,
    evidence: [],
    published: true,
    is_seed: true,
  });

  it('splits a description into sentences without breaking ordinals', () => {
    const text =
      'İstanbul Bölge Adliye Mahkemesi 14. Hukuk Dairesi davaları reddetti. Karar 22 Ekim 2026. Kesinleşme doğrulanmadı.';
    expect(splitSentences(text)).toEqual([
      'İstanbul Bölge Adliye Mahkemesi 14. Hukuk Dairesi davaları reddetti.',
      'Karar 22 Ekim 2026.',
      'Kesinleşme doğrulanmadı.',
    ]);
  });

  it('leads with the latest court decision and keeps what followed it', () => {
    const overview = caseOverview([
      event('a', '2025-01-10', 'filing'),
      event('b', '2026-06-24', 'court_decision'),
      event('c', '2026-10-22', 'court_decision'),
      event('d', '2026-10-24', 'statement'),
    ]);
    expect(overview?.featured.id).toBe('c');
    expect(overview?.after.map((e) => e.id)).toEqual(['d']);
    expect(overview?.earlier.map((e) => e.id)).toEqual(['b', 'a']);
  });

  it('falls back to the latest event when no court decision exists', () => {
    const overview = caseOverview([
      event('a', '2025-01-10', 'filing'),
      event('b', '2025-03-01', 'statement'),
    ]);
    expect(overview?.featured.id).toBe('b');
    expect(overview?.after).toEqual([]);
  });

  it('returns nothing for an empty case', () => {
    expect(caseOverview([])).toBeUndefined();
  });
});

describe('coverage label', () => {
  const days = (counts: number[]) =>
    counts.map((count, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, count }));

  it('names the whole window when data starts on its first day', () => {
    expect(coverageSince(days([1, 0, 2]))).toEqual({ label: 'Son 90 günde', since: '2026-10-01' });
  });

  it('names the first day with news when collection started later', () => {
    expect(coverageSince(days([0, 0, 3, 1]))).toEqual({
      label: "3 Ekim'den bu yana",
      since: '2026-10-03',
    });
  });

  it.each([
    ['2026-08-05', "5 Ağustos'tan bu yana"],
    ['2026-09-05', "5 Eylül'den bu yana"],
    ['2026-07-05', "5 Temmuz'dan bu yana"],
  ])('uses the right suffix for %s', (date, label) => {
    expect(
      coverageSince([
        { date: '2026-01-01', count: 0 },
        { date, count: 1 },
      ]).label,
    ).toBe(label);
  });
});
