import type { CaseEventT } from './schema';

/**
 * A sentence ends at . ! or ? after a lowercase letter, closing punctuation or a four-digit
 * year, and before a capital. Ordinals such as "14. Hukuk Dairesi" therefore stay whole.
 */
const SENTENCE_END = /(?<=(?:[a-zçğıöşü)"'’”]|\d{4})[.!?])\s+(?=[A-ZÇĞİÖŞÜ"“'‘])/u;

export function splitSentences(text: string): string[] {
  return text
    .split(SENTENCE_END)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface CaseOverview {
  /** The latest court decision, or the latest event when no decision exists yet. */
  featured: CaseEventT;
  /** Events after the featured one, oldest first. */
  after: CaseEventT[];
  /** Events before the featured one, newest first. */
  earlier: CaseEventT[];
}

export function caseOverview(events: CaseEventT[]): CaseOverview | undefined {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  let index = sorted.findLastIndex((e) => e.type === 'court_decision');
  if (index === -1) index = sorted.length - 1;
  if (index === -1) return undefined;
  return {
    featured: sorted[index],
    after: sorted.slice(index + 1),
    earlier: sorted.slice(0, index).reverse(),
  };
}
