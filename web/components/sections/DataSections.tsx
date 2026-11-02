import type { ReactNode } from 'react';

import { formatCalendarDate, formatNumber } from '@/lib/format';
import { CATEGORY_LABEL } from '@/lib/labels';
import { CATEGORIES, type SnapshotT } from '@/lib/schema';

import { AreaAnnotated } from '../charts/AreaAnnotated';
import { BubblePack } from '../charts/BubblePack';
import { StreamGraph } from '../charts/StreamGraph';

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
      data-wipe
      className="px-4 py-28 sm:px-8 sm:py-36"
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="mb-14 grid gap-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
          <h2 className="section-title">Ne zaman konuşuldu?</h2>
          <p className="dek">
            Son 90 günde {formatNumber(snapshot.totals.articles_90d)} haber çıktı. En yoğun gün{' '}
            {formatCalendarDate(peak.date)} oldu, {peak.count} haberle. Kesikli çizgiler dava
            gelişmelerini gösteriyor.
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
  const top = data.slice(0, 8);
  const maxCount = top[0]?.count ?? 1;

  return (
    <section data-section="sources" data-theme="paper" className="px-4 pb-28 sm:px-8 sm:pb-36">
      <div className="mx-auto grid max-w-[1360px] gap-16 border-t-2 border-(--fg) pt-16 lg:grid-cols-12">
        <div className="flex flex-col gap-8 lg:col-span-5">
          <h2 className="section-title">Kim yazdı?</h2>
          <p className="dek">
            Son 90 günde {formatNumber(snapshot.totals.sources_90d)} farklı yayın organı Martı TAG
            hakkında haber yaptı. Daire ne kadar büyükse o kadar çok haber.
          </p>
          <ol className="flex flex-col gap-3 font-sans">
            {top.map((s, i) => (
              <li key={s.domain} className="grid grid-cols-[1.5rem_1fr_auto] items-center gap-3">
                <span className="text-sm text-(--mute) tabular-nums">{i + 1}</span>
                <span className="relative">
                  <span className="relative z-10">{s.name}</span>
                  <span
                    className="absolute bottom-[-4px] left-0 h-[3px] bg-tag"
                    style={{ width: `${(s.count / maxCount) * 100}%` }}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm tabular-nums">{s.count}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="lg:col-span-7">
          <BubblePack data={data} />
        </div>
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
    <section
      data-section="topics"
      data-theme="ink"
      data-wipe
      className="px-4 py-28 sm:px-8 sm:py-36"
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="mb-14 grid gap-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
          <h2 className="section-title">Hangi konu öne çıktı?</h2>
          <p className="dek">
            Son {data.length} haftada haberlerin konulara dağılımı. En çok yer bulan konu{' '}
            {CATEGORY_LABEL[leader.c].toLocaleLowerCase('tr-TR')} oldu.
          </p>
        </div>
        <StreamGraph data={data} />
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
