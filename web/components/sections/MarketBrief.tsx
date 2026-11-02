import Link from 'next/link';

import { formatCalendarDate } from '@/lib/format';
import type { MarketT } from '@/lib/schema';

import { TradingViewChart } from '../market/TradingViewChart';

const FILINGS = 5;

/** Front-page market section: the MRT chart and the latest SEC filings, with a link to /borsa. */
export function MarketBrief({ market }: { market: MarketT | undefined }) {
  const filings = market?.filings.slice(0, FILINGS) ?? [];
  return (
    <section
      id="borsa"
      data-section="market"
      data-theme="paper"
      className="px-4 py-20 sm:px-8 sm:py-24"
    >
      <div className="mx-auto max-w-[1360px]">
        <header className="section-head mb-12 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
          <h2 className="section-title mt-4">Martı hissesi</h2>
          <p className="dek">
            Martı Technologies, <span className="hl">NYSE American</span> borsasında{' '}
            <span className="hl">MRT</span> koduyla işlem görüyor. Fiyatlar gecikmeli olabilir; bu
            bölüm yatırım tavsiyesi değildir.
          </p>
        </header>

        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <TradingViewChart />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <h3 className="kicker border-b border-(--fg) pb-2 text-[0.8rem]">
              Son SEC başvuruları
            </h3>
            {filings.length > 0 ? (
              <ol className="divide-y divide-(--line)">
                {filings.map((f) => (
                  <li key={f.url} className="grid grid-cols-[4.5rem_1fr] gap-3 py-3">
                    <span className="font-sans text-sm font-bold">{f.form}</span>
                    <span>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-serif font-bold hover:underline"
                      >
                        {f.title}
                      </a>
                      <span className="meta block">{formatCalendarDate(f.filed)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="meta">Başvurular henüz yüklenmedi.</p>
            )}
            <Link
              href="/borsa"
              className="mt-2 inline-block self-start border border-(--fg) px-5 py-2 font-sans text-sm font-semibold transition-colors hover:bg-(--fg) hover:text-(--bg)"
            >
              Bütün başvurular ve şirket haberleri
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
