import type { ReactNode } from 'react';

import { formatDate, formatTime } from '@/lib/format';
import { CATEGORY_LABEL } from '@/lib/labels';
import type { BoxShape } from '@/lib/layout';
import type { ArticleViewT } from '@/lib/schema';

import { ArticleLink } from './ArticleLink';
import { GenerativeCover } from './GenerativeCover';
import { Highlighted, KEY_TERMS } from './Highlighted';

export function AllegationBadge() {
  return (
    <span
      className="inline-flex items-center border border-(--alert) px-1.5 font-sans text-[11px] leading-[18px] font-bold text-(--alert)"
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
    <ArticleLink
      article={article}
      className="after:absolute after:inset-0 hover:underline hover:decoration-1 hover:underline-offset-4"
    >
      {children}
    </ArticleLink>
  );
}

/** One story on the ruled grid. Its shape comes from its length; text is never cropped. */
export function NewsBox({
  article,
  terms = KEY_TERMS,
  shape = 'small',
}: {
  article: ArticleViewT;
  terms?: readonly string[];
  shape?: BoxShape;
}) {
  const summary = article.display === 'full' ? article.summary : null;
  const big = shape !== 'small';
  return (
    <article className="group relative flex h-full flex-col gap-3 p-5">
      <Kicker article={article} />
      <h3 className={`headline ${big ? 'text-[clamp(1.45rem,1.9vw,1.75rem)]' : 'text-[1.3rem]'}`}>
        <StoryLink article={article}>{article.title}</StoryLink>
      </h3>
      {summary ? (
        <p
          className={`body-copy text-(--fg)/85 ${
            shape === 'wide' ? 'gap-8 lg:columns-2' : ''
          } ${big ? 'text-[1.02rem]' : 'text-[0.98rem]'}`}
        >
          <Highlighted text={summary} terms={terms} />
        </p>
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
  terms = KEY_TERMS,
}: {
  article: ArticleViewT;
  sources: Array<{ name: string; url: string }>;
  terms?: readonly string[];
}) {
  const summary = article.display === 'full' ? article.summary : null;
  return (
    <article className="relative flex h-full flex-col gap-4 p-5 sm:p-6">
      <Kicker article={article} />
      <h3 className="headline text-[clamp(1.9rem,3vw,2.6rem)] leading-[1.1]">
        <ArticleLink
          article={article}
          className="hover:underline hover:decoration-2 hover:underline-offset-[6px]"
        >
          {article.title}
        </ArticleLink>
      </h3>
      <GenerativeCover id={article.id} className="aspect-[21/9] w-full" />
      {summary && (
        <p className="body-copy text-[1.08rem]">
          <Highlighted text={summary} terms={terms} />
        </p>
      )}
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
    <aside className="flex h-full flex-col p-5" aria-labelledby="latest-title">
      <h3 id="latest-title" className="kicker border-b border-(--fg) pb-2 text-[0.8rem]">
        Diğer başlıklar
      </h3>
      {articles.length === 0 && (
        <p className="meta mt-3 italic">Yeni başlıklar geldikçe burada listelenir.</p>
      )}
      <ol className="flex flex-col divide-y divide-(--line)">
        {articles.map((a) => (
          <li key={a.id} className="py-3">
            <ArticleLink article={a} className="group block">
              <time dateTime={a.published_at} className="meta block">
                {formatTime(a.published_at)}, {a.source.name}
              </time>
              <span className="mt-1 block font-serif text-[1.02rem] leading-snug font-bold group-hover:underline">
                {a.title}
              </span>
            </ArticleLink>
          </li>
        ))}
      </ol>
    </aside>
  );
}
