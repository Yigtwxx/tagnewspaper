import { formatDate, formatTime, issueNumber } from '@/lib/format';
import { isEmptySnapshot, type SnapshotT } from '@/lib/schema';

import { type BoardRow, SplitFlapBoard } from './SplitFlapBoard';

export function Hero({ snapshot }: { snapshot: SnapshotT }) {
  const empty = isEmptySnapshot(snapshot);
  const rows: BoardRow[] = snapshot.latest.slice(0, 24).map((a) => ({
    id: a.id,
    url: a.url,
    time: formatTime(a.published_at),
    source: a.source.name,
    title: a.title,
    publishedAt: a.published_at,
  }));

  return (
    <section
      data-section="hero"
      data-theme="ink"
      className="relative flex min-h-[100svh] flex-col overflow-hidden px-4 pt-5 pb-8 sm:px-8"
    >
      <h1 className="sr-only">TAGNEWSPAPER: Martı TAG haberleri, dava takibi ve veriler</h1>

      <header className="meta flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span>
          {empty ? 'İlk sayı hazırlanıyor' : `Sayı ${issueNumber(snapshot.generated_at)}`}
        </span>
        {!empty && <span>{formatDate(snapshot.generated_at, { weekday: true })}</span>}
        <span className="hidden sm:inline">Bağımsız ve reklamsız</span>
      </header>

      <div className="flex flex-1 items-center py-10">
        <SplitFlapBoard rows={rows} />
      </div>

      <footer className="grid items-end gap-6 sm:grid-cols-[1fr_auto]">
        <p className="max-w-xl font-serif text-[clamp(1.15rem,2vw,1.6rem)] leading-snug text-white/90">
          Martı TAG hakkında çıkan haberler, mahkemelerden gelen kararlar ve açıklanan rakamlar.
          Hepsi kaynağıyla birlikte.
        </p>
        <a
          href="#haberler"
          className="meta inline-flex items-center gap-2 justify-self-start text-white sm:justify-self-end"
        >
          <span className="inline-block h-8 w-px animate-pulse bg-tag" aria-hidden="true" />
          Gazeteyi aç
        </a>
      </footer>
    </section>
  );
}
