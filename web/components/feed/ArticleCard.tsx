import { formatDate, formatTime } from '@/lib/format';
import { CATEGORY_COLOR, CATEGORY_LABEL } from '@/lib/labels';
import type { ArticleViewT } from '@/lib/schema';

import { GenerativeCover } from './GenerativeCover';

export function AllegationBadge() {
  return (
    <span
      className="inline-flex items-center border border-current px-1.5 py-px font-sans text-[11px] font-semibold tracking-wide"
      title="Bu haber iddia içeriyor. İddialar doğrulanmış bilgi değildir; kaynağına bakın."
    >
      İddia
    </span>
  );
}

export function CategoryTag({ article }: { article: ArticleViewT }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-[13px] font-medium">
      <span
        className="inline-block size-2 rounded-full"
        style={{ backgroundColor: CATEGORY_COLOR[article.category].light }}
        aria-hidden="true"
      />
      {CATEGORY_LABEL[article.category]}
    </span>
  );
}

export function ArticleMeta({ article }: { article: ArticleViewT }) {
  return (
    <p className="meta">
      <span className="font-medium text-(--fg)">{article.source.name}</span>
      <span className="mx-2" aria-hidden="true">
        /
      </span>
      <time dateTime={article.published_at}>
        {formatDate(article.published_at, { year: false })}, {formatTime(article.published_at)}
      </time>
    </p>
  );
}

export function ArticleCard({
  article,
  size = 'md',
}: {
  article: ArticleViewT;
  size?: 'md' | 'lg';
}) {
  const full = article.display === 'full' && article.summary;
  return (
    <article className="group relative flex flex-col gap-3" data-flip-id={article.id}>
      <GenerativeCover
        id={article.id}
        category={article.category}
        className={`transition-[filter] duration-500 group-hover:saturate-150 ${size === 'lg' ? 'aspect-[16/9]' : 'aspect-[16/8]'}`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <CategoryTag article={article} />
        {article.is_allegation && <AllegationBadge />}
      </div>
      <h3
        className={`headline ${size === 'lg' ? 'text-[clamp(1.6rem,2.6vw,2.4rem)]' : 'text-[clamp(1.25rem,1.6vw,1.55rem)]'}`}
      >
        <a
          href={article.url}
          target="_blank"
          rel="noopener noreferrer"
          className="after:absolute after:inset-0 hover:underline hover:decoration-1 hover:underline-offset-4"
        >
          {article.title}
        </a>
      </h3>
      {full ? (
        <p className="text-[1.0625rem] leading-relaxed text-(--fg)/85">{article.summary}</p>
      ) : (
        <p className="meta">Bu haber için özet yok. Başlığa tıklayıp kaynağında okuyabilirsiniz.</p>
      )}
      <ArticleMeta article={article} />
    </article>
  );
}
