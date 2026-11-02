import { Fragment } from 'react';

import {
  coverageSince,
  editionStart,
  formatDate,
  formatNumber,
  formatTime,
  issueNumber,
} from '@/lib/format';
import { isEmptySnapshot, type SnapshotT } from '@/lib/schema';

import { EditionCountdown } from './EditionCountdown';
import { EditionSeal } from './EditionSeal';
import { SplitFlapMasthead } from './SplitFlapMasthead';
import { Ticker } from './Ticker';

/** Left ear: a double-ruled box that sums up what the paper has covered so far. */
function TallyEar({ snapshot, empty }: { snapshot: SnapshotT; empty: boolean }) {
  // Same period for all three rows: the 90-day window, or since collection started.
  const { label, since } = coverageSince(snapshot.daily_counts);
  const events = snapshot.events.filter((e) => e.published && e.date >= since).length;
  const rows: [string, string][] = [
    [formatNumber(snapshot.totals.articles_90d), 'haber'],
    [formatNumber(snapshot.totals.sources_90d), 'kaynak'],
    [formatNumber(events), 'dava gelişmesi'],
  ];
  return (
    <div className="hidden w-44 shrink-0 lg:block">
      <div className="border border-white/90 p-[3px]">
        <div className="border border-white/35 px-3.5 pt-2.5 pb-3">
          <p className="font-serif text-[0.95rem] text-white/80 italic">{label}</p>
          {empty ? (
            <p className="meta mt-2 text-white/80">İlk sayı hazırlanıyor</p>
          ) : (
            <div className="mt-1.5 grid grid-cols-[auto_1fr] items-baseline gap-x-2.5 gap-y-1">
              {rows.map(([value, label]) => (
                <Fragment key={label}>
                  <span className="text-right font-serif text-[1.6rem] leading-none font-bold tabular-nums">
                    {value}
                  </span>
                  <span className="font-sans text-[12px] text-white/75">{label}</span>
                </Fragment>
              ))}
            </div>
          )}
          <p className="mt-3 border-t border-white/35 pt-2 font-sans text-[11px] leading-snug text-white/65">
            Her haber kendi kaynağına bağlanır.
          </p>
        </div>
      </div>
    </div>
  );
}

/** Nameplate band in the manner of a broadsheet: ears, nameplate, double rule, ticker. */
export function Hero({ snapshot }: { snapshot: SnapshotT }) {
  const empty = isEmptySnapshot(snapshot);
  return (
    <section data-section="hero" data-theme="ink" className="px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
      <h1 className="sr-only">TAGNEWSPAPER: Martı TAG haberleri, dava takibi ve veriler</h1>
      <div className="mx-auto max-w-[1360px]">
        <div className="hero-in flex items-center justify-between gap-6">
          <TallyEar snapshot={snapshot} empty={empty} />
          <div className="masthead-slot flex min-w-0 flex-1 justify-center">
            <SplitFlapMasthead />
          </div>
          <div className="hidden w-44 shrink-0 flex-col items-center gap-2.5 lg:flex">
            <EditionSeal
              issue={empty ? 1 : issueNumber(snapshot.generated_at)}
              date={
                empty
                  ? 'Hazırlanıyor'
                  : formatDate(editionStart(snapshot.generated_at), { year: false })
              }
            />
            <p className="meta text-center font-semibold text-tag">
              <EditionCountdown />
            </p>
          </div>
        </div>

        <p className="hero-in mx-auto mt-6 max-w-2xl text-center font-serif text-[clamp(1rem,1.5vw,1.2rem)] text-white/85 italic">
          Martı TAG hakkında çıkan <span className="hl">haberler</span>,{' '}
          <span className="hl">mahkeme kararları</span> ve açıklanan{' '}
          <span className="hl">rakamlar</span>. Bağımsız ve reklamsız.
        </p>

        <div className="hero-in mt-6 border-t-[3px] border-white pt-[3px]">
          <div className="border-t border-white" />
        </div>
        <div className="hero-in meta flex items-center justify-between py-2 text-white/80">
          <span>
            {empty ? (
              'İlk sayı hazırlanıyor'
            ) : (
              <>
                <span className="lg:hidden">Sayı {issueNumber(snapshot.generated_at)}, </span>
                {formatDate(snapshot.generated_at, { weekday: true })}
              </>
            )}
          </span>
          <span className="hidden sm:inline">Martı ile bağlantısı olmayan gönüllü bir yayın</span>
          <span>{empty ? '' : `Son güncelleme ${formatTime(snapshot.last_run_at)}`}</span>
        </div>
        <Ticker articles={snapshot.latest} />
      </div>
    </section>
  );
}
