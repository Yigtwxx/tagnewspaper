import type { ReactNode } from 'react';

/** Terms that always matter in this story, matched as Turkish word prefixes ("mahkeme" → "mahkemesi"). */
export const KEY_TERMS = [
  'mahkeme',
  'istinaf',
  'yargıtay',
  'dava',
  'karar',
  'ukome',
  'ibb',
  'bakanlık',
  'tbmm',
  'kanun',
  'yönetmelik',
  'düzenleme',
  'taksici',
  'sürücü',
  'yolcu',
  'erişim',
  'yasak',
  'vergi',
  'ceza',
] as const;

const MAX_HITS = 2;
const MIN_TERM = 3;
const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/**
 * Renders `text` with up to two important words in TAG green. Each term is marked once,
 * at its first occurrence; matching is case-insensitive with Turkish rules.
 */
export function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  const wanted = [...new Set(terms.map(lower).filter((t) => t.length >= MIN_TERM))];
  if (wanted.length === 0) return <>{text}</>;

  const parts = text.split(/(\p{L}+)/u);
  const used = new Set<string>();
  const out: ReactNode[] = [];
  let lastHit = -10;
  for (const [i, part] of parts.entries()) {
    const term =
      used.size < MAX_HITS && i - lastHit > 2 && /^\p{L}+$/u.test(part)
        ? wanted.find((t) => !used.has(t) && lower(part).startsWith(t))
        : undefined;
    if (term) {
      used.add(term);
      lastHit = i;
      out.push(
        <span key={i} className="hl">
          {part}
        </span>,
      );
    } else {
      out.push(part);
    }
  }
  return <>{out}</>;
}
