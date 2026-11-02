import { formatCalendarDate, formatCompact } from '@/lib/format';
import type { StatT } from '@/lib/schema';

import { CityMap } from './CityMap';
import { DotMatrix, NumbersMotion } from './NumbersClient';
import { SectionMargins } from '../SectionMargins';

const PER_DOT = 10_000;

function Figure({ stat }: { stat: StatT }) {
  const compact = formatCompact(stat.value);
  const digits = compact.value.includes(',') ? compact.value.split(',')[1].length : 0;
  const numeric = Number(compact.value.replace(/\./g, '').replace(',', '.'));
  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-baseline gap-3 pb-3">
        <span
          className="numeral text-[clamp(3.75rem,8.5vw,7.5rem)]"
          data-count={numeric}
          data-digits={digits}
        >
          {compact.value}
        </span>
        <span className="font-sans text-[clamp(1.25rem,2.4vw,2rem)] font-semibold">
          {compact.unit}
        </span>
      </p>
      <p className="font-serif text-2xl font-bold">{stat.label}</p>
      <p className="meta max-w-sm">
        {stat.scope}, {formatCalendarDate(stat.as_of)} itibarıyla. Kaynak:{' '}
        <a
          href={stat.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="link-underline"
        >
          {stat.source_name}
        </a>
      </p>
    </div>
  );
}

export function Numbers({ stats, runningHead }: { stats: StatT[]; runningHead: string }) {
  const riders = stats.find((s) => s.key === 'registered_riders');
  const drivers = stats.find((s) => s.key === 'drivers');
  const istanbul = stats.find((s) => s.key === 'drivers_istanbul');

  return (
    <section
      id="rakamlar"
      data-section="numbers"
      data-theme="ink"
      className="margin-clip relative px-4 py-20 sm:px-8 sm:py-24"
    >
      <SectionMargins index={2} label="Rakamlar" theme="ink" runningHead={runningHead} />
      <div className="mx-auto max-w-[1360px]">
        <div className="section-head mb-12 grid gap-4 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
          <h2 className="section-title mt-4">Kaç kişi kullanıyor?</h2>
          <p className="dek">
            Şirketin açıkladığı son rakamlar. Bunlar <span className="hl">canlı veri değildir</span>
            ; yeni bir resmî açıklama geldiğinde güncellenir.
          </p>
        </div>

        {stats.length === 0 ? (
          <p className="dek">Rakamlar henüz yüklenmedi.</p>
        ) : (
          <NumbersMotion>
            <div className="grid gap-x-16 gap-y-24 lg:grid-cols-2">
              {riders && (
                <>
                  <Figure stat={riders} />
                  <div className="flex flex-col justify-start gap-4 lg:pt-6">
                    <DotMatrix
                      group={{
                        count: Math.round(riders.value / PER_DOT),
                        filled: Math.round(riders.value / PER_DOT),
                        color: '#ffffff',
                      }}
                      columns={35}
                      label={`${riders.label}: her nokta 10.000 kişi`}
                    />
                    <p className="meta">Her nokta 10.000 kişiyi gösterir.</p>
                  </div>
                </>
              )}
              {drivers && (
                <>
                  <div className="flex flex-col gap-16">
                    <Figure stat={drivers} />
                    {istanbul && <Figure stat={istanbul} />}
                  </div>
                  <div className="flex flex-col justify-start gap-4 lg:pt-6">
                    <DotMatrix
                      group={{
                        count: Math.round(drivers.value / PER_DOT),
                        filled: istanbul
                          ? Math.round(istanbul.value / PER_DOT)
                          : Math.round(drivers.value / PER_DOT),
                        color: '#01b251',
                      }}
                      columns={35}
                      label={`${drivers.label}: her nokta 10.000 sürücü`}
                    />
                    {istanbul && (
                      <ul className="meta flex flex-wrap gap-x-6 gap-y-2">
                        <li className="flex items-center gap-2">
                          <span
                            className="inline-block size-2.5 rounded-full bg-tag"
                            aria-hidden="true"
                          />
                          İstanbul ({formatCalendarDate(istanbul.as_of, { year: false })} verisi)
                        </li>
                        <li className="flex items-center gap-2">
                          <span
                            className="inline-block size-2.5 rounded-full border-2 border-tag"
                            aria-hidden="true"
                          />
                          Diğer şehirler (aradaki fark)
                        </li>
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          </NumbersMotion>
        )}
        <CityMap />
      </div>
    </section>
  );
}
