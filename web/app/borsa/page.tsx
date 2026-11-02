import type { Metadata } from 'next';

import { NewsBox } from '@/components/feed/NewsBox';
import { StockChart } from '@/components/market/StockChart';
import { TradingViewChart } from '@/components/market/TradingViewChart';
import { PageEffects } from '@/components/motion/PageEffects';
import { ThemeTriggers } from '@/components/motion/ThemeTriggers';
import { Colophon } from '@/components/sections/Colophon';
import { TopBar } from '@/components/TopBar';
import { getMarket, getSnapshot } from '@/lib/data';
import { formatCalendarDate, formatDate } from '@/lib/format';
import { isEmptySnapshot, type MarketPriceT } from '@/lib/schema';

export const metadata: Metadata = {
  title: 'Borsa: Martı (MRT)',
  description:
    'Martı Technologies hissesinin (NYSE American: MRT) gün sonu fiyatları ve SEC başvuruları. Yatırım tavsiyesi değildir.',
  alternates: { canonical: '/borsa' },
};

const usd = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' });
const pct = new Intl.NumberFormat('tr-TR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'always',
});
const compact = new Intl.NumberFormat('tr-TR', { notation: 'compact' });

function Quote({ prices }: { prices: MarketPriceT[] }) {
  const last = prices[prices.length - 1];
  const prev = prices[prices.length - 2] ?? last;
  const change = last.close - prev.close;
  const ratio = prev.close ? change / prev.close : 0;
  const year = prices.slice(-252);
  const low = Math.min(...year.map((p) => p.low));
  const high = Math.max(...year.map((p) => p.high));
  const avgVol = year.reduce((s, p) => s + p.volume, 0) / year.length;
  const up = change >= 0;

  return (
    <div className="mb-12 grid gap-8 border-b border-(--line) pb-10 md:grid-cols-[auto_1fr] md:items-end md:gap-16">
      <div>
        <p className="numeral text-[clamp(3.5rem,8vw,6.5rem)]">{usd.format(last.close)}</p>
        <p
          className={`mt-3 font-sans text-xl font-semibold tabular-nums ${up ? 'text-tag-ink' : ''}`}
        >
          <span aria-hidden="true">{up ? '▲' : '▼'}</span> {usd.format(Math.abs(change))} (
          {pct.format(ratio)})
        </p>
        <p className="meta mt-1">{formatCalendarDate(last.date)} kapanışı, önceki güne göre</p>
      </div>
      <dl className="grid grid-cols-2 gap-6 font-sans sm:grid-cols-3">
        <div>
          <dt className="meta">Dönem aralığı</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">
            {usd.format(low)} – {usd.format(high)}
          </dd>
        </div>
        <div>
          <dt className="meta">Ortalama günlük hacim</dt>
          <dd className="mt-1 text-lg font-semibold tabular-nums">{compact.format(avgVol)}</dd>
        </div>
        <div>
          <dt className="meta">Veri</dt>
          <dd className="mt-1 text-lg font-semibold">{prices.length} işlem günü</dd>
        </div>
      </dl>
    </div>
  );
}

export default async function BorsaPage() {
  const [market, snapshot] = await Promise.all([getMarket(), getSnapshot()]);
  const hasData = !isEmptySnapshot(snapshot);
  const companyNews = snapshot.latest.filter((a) => a.category === 'sirket').slice(0, 4);

  return (
    <>
      <TopBar lastRunAt={snapshot.last_run_at} hasData={hasData} alwaysShown />
      <main>
        <section data-section="market" data-theme="paper" className="px-4 pt-28 pb-24 sm:px-8">
          <div className="mx-auto max-w-[1360px]">
            <header className="section-head mb-10 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
              <h1 className="section-title mt-4">Martı hissesi</h1>
              <p className="dek">
                Martı Technologies, <span className="hl">NYSE American</span> borsasında{' '}
                <span className="hl">MRT</span> koduyla işlem görüyor. Fiyatlar gecikmeli olabilir.
                Bu sayfa <span className="hl">yatırım tavsiyesi değildir</span>.
              </p>
            </header>

            {market && market.prices.length >= 2 ? (
              <>
                <Quote prices={market.prices} />
                <StockChart prices={market.prices} />
              </>
            ) : (
              <TradingViewChart />
            )}

            <div className="mt-20 grid gap-16 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <header className="section-head mb-6">
                  <h2 className="section-title mt-4 text-[clamp(1.6rem,2.4vw,2.2rem)]">
                    SEC başvuruları
                  </h2>
                  <p className="dek mt-2">
                    Şirketin ABD Menkul Kıymetler ve Borsa Komisyonu&apos;na (SEC) yaptığı son resmî
                    başvurular.
                  </p>
                </header>
                {market && market.filings.length > 0 ? (
                  <ol className="divide-y divide-(--line)">
                    {market.filings.map((f) => (
                      <li key={f.url} className="grid grid-cols-[5.5rem_1fr] gap-4 py-4">
                        <span className="font-sans text-sm font-bold">{f.form}</span>
                        <span>
                          <a
                            href={f.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-serif text-lg font-bold hover:underline"
                          >
                            {f.title}
                          </a>
                          <span className="meta block">{formatCalendarDate(f.filed)}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="meta">
                    Başvurular yüklenmedi.{' '}
                    <a
                      href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001852767"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="link-underline"
                    >
                      SEC EDGAR üzerinde görüntüleyin
                    </a>
                    .
                  </p>
                )}
              </div>

              <div className="lg:col-span-5">
                <header className="section-head mb-6">
                  <h2 className="section-title mt-4 text-[clamp(1.6rem,2.4vw,2.2rem)]">
                    Şirket haberleri
                  </h2>
                </header>
                {companyNews.length > 0 ? (
                  <div className="rule-grid">
                    <div className="rule-grid__inner grid-cols-1">
                      {companyNews.map((a) => (
                        <div key={a.id} className="rule-cell">
                          <NewsBox article={a} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="meta">Son günlerde şirketle ilgili haber yok.</p>
                )}
              </div>
            </div>

            <p className="meta mt-20 max-w-3xl border-t border-(--line) pt-6">
              Fiyatlar gecikmeli verilerdir
              {market?.price_source
                ? ` (kaynak: ${market.price_source})`
                : ' (kaynak: TradingView)'}
              ; başvurular SEC EDGAR&apos;dan alınır.
              {market ? ` Son güncelleme: ${formatDate(market.updated_at)}.` : ''} Bu sayfa bilgi
              amaçlıdır, yatırım tavsiyesi değildir. TAGNEWSPAPER&apos;ın Martı ile bağlantısı
              yoktur.
            </p>
          </div>
        </section>
      </main>
      <Colophon lastRunAt={snapshot.last_run_at} hasData={hasData} />
      <ThemeTriggers />
      <PageEffects />
    </>
  );
}
