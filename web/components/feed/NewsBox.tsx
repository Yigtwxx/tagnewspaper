import type { ReactNode } from 'react';

import { formatDate, formatTime } from '@/lib/format';
import { CATEGORY_LABEL } from '@/lib/labels';
import type { ArticleViewT } from '@/lib/schema';

import { GenerativeCover } from './GenerativeCover';

export function AllegationBadge() {
  return (
    <span
      className="inline-flex items-center border border-current px-1.5 font-sans text-[11px] leading-[18px] font-semibold"
      title="Bu haber iddia içeriyor. İddialar doğrulanmış bilgi değildir; kaynağına bakın."
    >
      İddia
    </span>
  );
}

export function Kicker({ article }: { article: ArticleViewT }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="kicker">{CATEGORY_LABEL[article.category]}</span>
      {article.is_allegation && <AllegationBadge />}
    </div>
  );
}

export function Byline({ article }: { article: ArticleViewT }) {
  return (
    <p className="meta">
      <span className="font-semibold text-(--fg)">{article.source.name}</span>
      <span className="mx-1.5" aria-hidden="true">
        |
      </span>
      <time dateTime={article.published_at}>
        {formatDate(article.published_at, { year: false })}, {formatTime(article.published_at)}
      </time>
    </p>
  );
}

function StoryLink({ article, children }: { article: ArticleViewT; children: ReactNode }) {
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noopener noreferrer"
      className="after:absolute after:inset-0 hover:underline hover:decoration-1 hover:underline-offset-4"
    >
      {children}
    </a>
  );
}

/** A fixed-size ruled box on the front page grid. Text is clamped so every box keeps its size. */
export function NewsBox({ article }: { article: ArticleViewT }) {
  const summary = article.display === 'full' ? article.summary : null;
  return (
    <article className="group relative flex h-full flex-col gap-3 overflow-hidden p-5">
      <Kicker article={article} />
      <h3 className="headline line-clamp-4 text-[1.375rem]">
        <StoryLink article={article}>{article.title}</StoryLink>
      </h3>
      {summary ? (
        <p className="body-copy line-clamp-6 text-[0.98rem] text-(--fg)/85">{summary}</p>
      ) : (
        <p className="meta italic">Özet yok; haberi kaynağında okuyun.</p>
      )}
      <div className="mt-auto pt-2">
        <Byline article={article} />
      </div>
    </article>
  );
}

/** The 2×2 lead box: larger headline, a monochrome cover and the list of outlets. */
export function LeadBox({
  article,
  sources,
}: {
  article: ArticleViewT;
  sources: Array<{ name: string; url: string }>;
}) {
  const summary = article.display === 'full' ? article.summary : null;
  return (
    <article className="relative flex h-full flex-col gap-4 overflow-hidden p-5 sm:p-6">
      <Kicker article={article} />
      <h3 className="headline line-clamp-4 text-[clamp(1.9rem,3vw,2.6rem)] leading-[1.08]">
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline hover:decoration-2 hover:underline-offset-[6px]"
        >
          {article.title}
        </a>
      </h3>
      <GenerativeCover id={article.id} className="aspect-[21/9] w-full" />
      {summary && <p className="body-copy line-clamp-4 text-[1.08rem]">{summary}</p>}
      <div className="mt-auto flex flex-col gap-2">
        <Byline article={article} />
        {sources.length > 1 && (
          <p className="meta">
            Bu haberi {sources.length} yayın organı yazdı:{' '}
            {sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ', '}
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="link-underline"
                >
                  {s.name}
                </a>
              </span>
            ))}
          </p>
        )}
      </div>
    </article>
  );
}

/** Tall box listing the newest headlines, newspaper "briefing" style. */
export function LatestBox({ articles }: { articles: ArticleViewT[] }) {
  return (
    <aside className="flex h-full flex-col overflow-hidden p-5" aria-labelledby="latest-title">
      <h3 id="latest-title" className="kicker border-b border-(--fg) pb-2 text-[0.8rem]">
        Diğer başlıklar
      </h3>
      {articles.length === 0 && (
        <p className="meta mt-3 italic">Yeni başlıklar geldikçe burada listelenir.</p>
      )}
      <ol className="flex flex-col divide-y divide-(--line)">
        {articles.map((a) => (
          <li key={a.id} className="py-3">
            <a href={a.url} target="_blank" rel="noopener noreferrer" className="group block">
              <time dateTime={a.published_at} className="meta block">
                {formatTime(a.published_at)}, {a.source.name}
              </time>
              <span className="mt-1 line-clamp-3 font-serif text-[1.02rem] leading-snug font-bold group-hover:underline">
                {a.title}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}
