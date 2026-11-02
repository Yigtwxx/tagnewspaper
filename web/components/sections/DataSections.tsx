import type { ReactNode } from 'react';

import { formatCalendarDate, formatNumber } from '@/lib/format';
import { CATEGORY_LABEL } from '@/lib/labels';
import { CATEGORIES, type SnapshotT } from '@/lib/schema';

import { AreaAnnotated } from '../charts/AreaAnnotated';
import { SourceSpreadViz } from '../charts/SourceSpreadViz';
import { StreamGraph } from '../charts/StreamGraph';
import { TopTerms } from '../charts/TopTerms';

function TableToggle({ summary, children }: { summary: string; children: ReactNode }) {
  return (
    <details className="mt-8 font-sans text-sm">
      <summary className="cursor-pointer text-(--mute) hover:text-(--fg)">{summary}</summary>
      <div className="mt-4 max-h-80 overflow-auto border border-(--line)">{children}</div>
    </details>
  );
}

const th = 'sticky top-0 bg-(--bg) px-3 py-2 text-left font-semibold';
const td = 'border-t border-(--line) px-3 py-1.5 tabular-nums';

function shorten(text: string, max = 30): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function NewsDensity({ snapshot }: { snapshot: SnapshotT }) {
  const data = snapshot.daily_counts;
  if (data.length < 2) return null;
  const peak = data.reduce((a, b) => (b.count > a.count ? b : a), data[0]);
  const markers = snapshot.events.map((e) => ({ date: e.date, label: shorten(e.title) }));

  return (
    <section
      id="veriler"
      data-section="density"
      data-theme="paper"
      className="px-4 py-28 sm:px-8 sm:py-36"
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="section-head mb-12 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
          <h2 className="section-title mt-4">Ne zaman konuşuldu?</h2>
          <p className="dek">
            Son 90 günde{' '}
            <span className="hl">{formatNumber(snapshot.totals.articles_90d)} haber</span> çıktı. En
            yoğun gün <span className="hl">{formatCalendarDate(peak.date)}</span> oldu, {peak.count}{' '}
            haberle. Kesikli çizgiler dava gelişmelerini gösteriyor.
          </p>
        </div>
        <AreaAnnotated data={data} markers={markers} />
        <TableToggle summary="Günlük sayıları tablo olarak göster">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Gün</th>
                <th className={th}>Haber</th>
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((d) => (
                <tr key={d.date}>
                  <td className={td}>{formatCalendarDate(d.date)}</td>
                  <td className={td}>{d.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableToggle>
      </div>
    </section>
  );
}

export function SourceSpread({ snapshot }: { snapshot: SnapshotT }) {
  const data = snapshot.source_counts;
  if (data.length === 0) return null;

  return (
    <section data-section="sources" data-theme="paper" className="px-4 pb-28 sm:px-8 sm:pb-36">
      <div className="mx-auto max-w-[1360px]">
        <header className="section-head mb-12 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
          <h2 className="section-title mt-4">Kim yazdı?</h2>
          <p className="dek">
            Son 90 günde{' '}
            <span className="hl">
              {formatNumber(snapshot.totals.sources_90d)} farklı yayın organı
            </span>{' '}
            Martı TAG hakkında haber yaptı. Daire ne kadar büyükse o kadar çok haber; bir yayına
            gelince iki tarafta da vurgulanır.
          </p>
        </header>
        <SourceSpreadViz data={data} />
      </div>
    </section>
  );
}

export function TopicTrends({ snapshot }: { snapshot: SnapshotT }) {
  const data = snapshot.category_weekly;
  if (data.length < 2) return null;
  const totals = CATEGORIES.map((c) => ({
    c,
    n: data.reduce((sum, w) => sum + (w.counts[c] ?? 0), 0),
  })).sort((a, b) => b.n - a.n);
  const leader = totals[0];

  return (
    <section data-section="topics" data-theme="ink" className="px-4 py-28 sm:px-8 sm:py-36">
      <div className="mx-auto max-w-[1360px]">
        <div className="section-head mb-12 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
          <h2 className="section-title mt-4">Hangi konu öne çıktı?</h2>
          <p className="dek">
            Son {data.length} haftada haberlerin konulara dağılımı. En çok yer bulan konu{' '}
            <span className="hl">{CATEGORY_LABEL[leader.c].toLocaleLowerCase('tr-TR')}</span> oldu.
          </p>
        </div>
        <StreamGraph data={data} />
        <TopTerms terms={snapshot.top_terms} />
        <TableToggle summary="Haftalık sayıları tablo olarak göster">
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>Hafta</th>
                {CATEGORIES.map((c) => (
                  <th key={c} className={th}>
                    {CATEGORY_LABEL[c]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...data].reverse().map((w) => (
                <tr key={w.week_start}>
                  <td className={td}>{formatCalendarDate(w.week_start, { short: true })}</td>
                  {CATEGORIES.map((c) => (
                    <td key={c} className={td}>
                      {w.counts[c] ?? 0}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </TableToggle>
      </div>
    </section>
  );
}
