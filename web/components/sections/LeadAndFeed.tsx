import { encodeCursor } from '@/lib/cursor';
import type { SnapshotT } from '@/lib/schema';

import { AllegationBadge, ArticleMeta, CategoryTag } from '../feed/ArticleCard';
import { FeedClient } from '../feed/FeedClient';
import { GenerativeCover } from '../feed/GenerativeCover';

export function LeadAndFeed({ snapshot }: { snapshot: SnapshotT }) {
  const lead = snapshot.lead;
  const rest = snapshot.latest.filter((a) => a.id !== lead?.article.id);
  const last = snapshot.latest.at(-1);
  const cursor =
    snapshot.latest.length >= 24 && last ? encodeCursor(last.published_at, last.id) : undefined;

  return (
    <section
      id="haberler"
      data-section="feed"
      data-theme="paper"
      data-wipe
      className="px-4 pt-24 pb-28 sm:px-8 sm:pt-32"
    >
      <div className="mx-auto max-w-[1360px]">
        <div className="mb-14 grid gap-6 lg:grid-cols-[1fr_minmax(0,28rem)] lg:items-end">
          <h2 className="section-title">Gündem</h2>
          <p className="dek">
            Martı TAG hakkında yayımlanan haberlerin kısa özetleri. Her başlık, haberi yayımlayan
            sitenin kendisine açılır.
          </p>
        </div>

        {lead ? (
          <article className="relative mb-24 grid gap-8 border-t-2 border-(--fg) pt-8 lg:grid-cols-12 lg:gap-12">
            <div className="flex flex-col gap-5 lg:col-span-7">
              <div className="flex flex-wrap items-center gap-2">
                <CategoryTag article={lead.article} />
                {lead.article.is_allegation && <AllegationBadge />}
              </div>
              <h3 className="headline text-[clamp(2.2rem,5.2vw,4.75rem)]">
                <a
                  href={lead.article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline hover:decoration-2 hover:underline-offset-8"
                >
                  {lead.article.title}
                </a>
              </h3>
              {lead.article.display === 'full' && lead.article.summary && (
                <p className="max-w-[38rem] text-[clamp(1.15rem,1.4vw,1.35rem)] leading-relaxed">
                  {lead.article.summary}
                </p>
              )}
              <ArticleMeta article={lead.article} />
            </div>
            <div className="flex flex-col gap-5 lg:col-span-5">
              <GenerativeCover
                id={lead.article.id}
                category={lead.article.category}
                className="aspect-[4/3]"
              />
              {lead.sources.length > 1 && (
                <div>
                  <p className="meta mb-2">Bu haberi {lead.sources.length} yayın organı yazdı:</p>
                  <ul className="flex flex-wrap gap-2">
                    {lead.sources.map((s) => (
                      <li key={s.url}>
                        <a
                          href={s.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block border border-(--line) px-3 py-1 font-sans text-sm hover:border-(--fg)"
                        >
                          {s.name}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </article>
        ) : (
          <div className="mb-16 border-t-2 border-(--fg) pt-8">
            <p className="headline max-w-3xl text-[clamp(1.8rem,3.5vw,3rem)]">
              İlk haberler toplanıyor. Sayfa her 15 dakikada bir kendiliğinden güncellenir.
            </p>
          </div>
        )}

        {rest.length > 0 && <FeedClient initial={rest} initialCursor={cursor} />}
      </div>
    </section>
  );
}
