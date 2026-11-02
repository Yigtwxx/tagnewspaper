import { encodeCursor } from '@/lib/cursor';
import type { SnapshotT } from '@/lib/schema';

import { FeedClient } from '../feed/FeedClient';
import { KEY_TERMS } from '../feed/Highlighted';
import { LatestBox, LeadBox, NewsBox } from '../feed/NewsBox';

/** Stories placed on the front page grid before the filterable feed starts. */
const FRONT_STORIES = 6;
/** Short headline-only list in the right column, continuing after the boxed stories. */
const BRIEFS = 7;

export function LeadAndFeed({ snapshot }: { snapshot: SnapshotT }) {
  const lead = snapshot.lead;
  const terms = [...snapshot.top_terms.map((t) => t.term), ...KEY_TERMS];
  const others = snapshot.latest.filter((a) => a.id !== lead?.article.id);
  const front = others.slice(0, FRONT_STORIES);
  const briefs = others.slice(FRONT_STORIES, FRONT_STORIES + BRIEFS);
  const rest = others.slice(FRONT_STORIES + BRIEFS);
  const last = snapshot.latest.at(-1);
  const cursor =
    snapshot.latest.length >= 24 && last ? encodeCursor(last.published_at, last.id) : undefined;

  return (
    <section
      id="haberler"
      data-section="feed"
      data-theme="paper"
      className="px-4 pt-10 pb-24 sm:px-8"
    >
      <div className="mx-auto max-w-[1360px]">
        {lead ? (
          <div className="rule-grid">
            <div className="rule-grid__inner grid-flow-row-dense grid-cols-1 sm:auto-rows-[23rem] sm:grid-cols-2 lg:grid-cols-4">
              <div className="rule-cell sm:col-span-2 sm:row-span-2">
                <LeadBox
                  article={lead.article}
                  sources={lead.sources.map((s) => ({ name: s.name, url: s.url }))}
                  terms={terms}
                />
              </div>
              <div className="rule-cell sm:row-span-2 lg:col-start-4 lg:row-start-1">
                <LatestBox articles={briefs} />
              </div>
              {front.map((article) => (
                <div key={article.id} className="rule-cell">
                  <NewsBox article={article} terms={terms} />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="headline max-w-3xl py-10 text-[clamp(1.6rem,3vw,2.4rem)]">
            İlk haberler toplanıyor. Sayfa her 15 dakikada bir kendiliğinden güncellenir.
          </p>
        )}

        {rest.length > 0 && (
          <div className="mt-20">
            <header className="section-head mb-8">
              <h2 className="section-title mt-4">Haber akışı</h2>
              <p className="dek mt-2">
                Martı TAG hakkındaki bütün haberler, en yeniden eskiye. Başlıklar haberi yayımlayan
                sitenin kendisine açılır.
              </p>
            </header>
            <FeedClient initial={rest} initialCursor={cursor} terms={terms} />
          </div>
        )}
      </div>
    </section>
  );
}
