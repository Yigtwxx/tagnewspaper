import Link from 'next/link';

import { ArticleLink } from '@/components/feed/ArticleLink';
import { GenerativeCover } from '@/components/feed/GenerativeCover';
import { Byline, Kicker } from '@/components/feed/NewsBox';
import { formatDate } from '@/lib/format';
import { ACTOR_LABEL } from '@/lib/labels';
import type { ArticleViewT } from '@/lib/schema';
import { siteUrl } from '@/lib/site';
import { articlePath } from '@/lib/slug';

/** schema.org NewsArticle. The site is the publisher of the summary; no author is claimed. */
function ArticleJsonLd({ article }: { article: ArticleViewT }) {
  const url = `${siteUrl()}${articlePath(article)}`;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: article.title.slice(0, 110),
    description: article.summary ?? undefined,
    datePublished: article.published_at,
    inLanguage: 'tr-TR',
    url,
    mainEntityOfPage: url,
    image: [`${url}/opengraph-image`],
    isBasedOn: article.url,
    publisher: { '@type': 'Organization', name: 'TAGNEWSPAPER', url: siteUrl() },
  };
  // Escape "<" so a title can never close the script element.
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

export function ArticleBody({
  article,
  related,
}: {
  article: ArticleViewT;
  related: ArticleViewT[];
}) {
  const actors = article.actors.filter((a) => a !== 'diger').map((a) => ACTOR_LABEL[a]);

  return (
    <section data-section="article" data-theme="paper" className="px-4 pt-28 pb-24 sm:px-8">
      <article className="mx-auto max-w-[46rem]">
        <Link href="/" className="meta link-underline">
          ← Ön sayfa
        </Link>

        <header className="section-head mt-6 flex flex-col gap-4 pt-6">
          <Kicker article={article} />
          <h1 className="headline text-[clamp(2rem,4.4vw,3.25rem)] leading-[1.08]">
            {article.title}
          </h1>
          <Byline article={article} />
        </header>

        <GenerativeCover id={article.id} className="mt-8 aspect-[21/9] w-full" />

        {article.summary && (
          <p className="body-copy mt-8 text-[1.15rem] text-pretty">{article.summary}</p>
        )}
        {article.is_allegation && (
          <p className="meta mt-4 italic">
            Bu haber iddia içeriyor. İddialar doğrulanmış bilgi değildir; kaynağına bakın.
          </p>
        )}
        {actors.length > 0 && (
          <p className="meta mt-6">
            <span className="font-semibold text-(--fg)">Haberdeki taraflar:</span>{' '}
            {actors.join(', ')}
          </p>
        )}

        <div className="mt-10 flex flex-col items-start gap-3">
          <a
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-(--fg) px-6 py-3 font-sans text-sm font-semibold transition-colors hover:bg-(--fg) hover:text-(--bg)"
          >
            Haberin tamamı: {article.source.name} <span aria-hidden="true">↗</span>
          </a>
          <p className="meta max-w-[38rem]">
            Bu özet, kaynaktaki haberden otomatik olarak hazırlandı. Ayrıntılar ve haberin
            sorumluluğu yayın organına aittir.
          </p>
        </div>

        {related.length > 0 && (
          <section aria-labelledby="related-title" className="mt-16 border-t border-(--fg) pt-3">
            <h2 id="related-title" className="kicker text-[0.8rem]">
              Bu hikâyeyi yazan diğer kaynaklar
            </h2>
            <ul className="mt-1 flex flex-col divide-y divide-(--line)">
              {related.map((a) => (
                <li key={a.id} className="py-3">
                  <ArticleLink article={a} className="group block">
                    <span className="meta block">
                      {formatDate(a.published_at, { year: false })}, {a.source.name}
                    </span>
                    <span className="mt-1 block font-serif text-[1.05rem] leading-snug font-bold group-hover:underline">
                      {a.title}
                    </span>
                  </ArticleLink>
                </li>
              ))}
            </ul>
          </section>
        )}

        <ArticleJsonLd article={article} />
      </article>
    </section>
  );
}
