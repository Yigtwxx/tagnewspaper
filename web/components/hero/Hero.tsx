import type { ReactNode } from 'react';

import { editionStart, formatDate, formatTime, issueNumber } from '@/lib/format';
import { isEmptySnapshot, type SnapshotT } from '@/lib/schema';

import { EditionCountdown } from './EditionCountdown';
import { SplitFlapMasthead } from './SplitFlapMasthead';
import { Ticker } from './Ticker';

/** Newspaper "ear": a ruled box beside the nameplate (thick rule over a hairline). */
function Ear({ children, align }: { children: ReactNode; align: 'left' | 'right' }) {
  return (
    <div
      className={`hidden w-44 shrink-0 border-t-[3px] border-white pt-[3px] lg:block ${
        align === 'right' ? 'text-right' : ''
      }`}
    >
      <div className="flex flex-col gap-1.5 border-t border-white/70 pt-3">{children}</div>
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
          <Ear align="left">
            <p className="font-serif text-[1.15rem] leading-snug italic">
              “Bütün haberler, kaynağıyla.”
            </p>
            <p className="meta text-white/70">Her haber kendi kaynağına bağlanır</p>
          </Ear>
          <div className="flex min-w-0 flex-1 justify-center">
            <SplitFlapMasthead />
          </div>
          <Ear align="right">
            <p className="font-sans text-[11px] tracking-[0.2em] text-white/70">SAYI</p>
            <p className="font-serif text-[3.25rem] leading-none font-bold">
              {empty ? '1' : issueNumber(snapshot.generated_at)}
            </p>
            <p className="meta text-white/80">
              {empty
                ? 'İlk sayı hazırlanıyor'
                : `${formatDate(editionStart(snapshot.generated_at), { year: false })} baskısı, 11.00`}
            </p>
            <p className="meta font-semibold text-tag">
              <EditionCountdown />
            </p>
          </Ear>
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
