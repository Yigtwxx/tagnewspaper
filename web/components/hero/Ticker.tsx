import { formatTime } from '@/lib/format';
import type { ArticleViewT } from '@/lib/schema';

/** Endless headline band under the nameplate. Pauses on hover; static with reduced motion. */
export function Ticker({ articles }: { articles: ArticleViewT[] }) {
  if (articles.length === 0) return null;
  const items = articles.slice(0, 10);
  const row = (hidden: boolean) => (
    <ul className="ticker__row" aria-hidden={hidden || undefined}>
      {items.map((a) => (
        <li key={`${hidden ? 'b' : 'a'}-${a.id}`} className="flex items-center gap-3 pr-10">
          <span className="meta text-white/60">{formatTime(a.published_at)}</span>
          <a
            href={a.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={hidden ? -1 : undefined}
            className="font-serif text-[0.98rem] whitespace-nowrap text-white hover:underline"
          >
            {a.title}
          </a>
          <span className="text-tag" aria-hidden="true">
            ■
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="ticker flex items-center border-y border-white/25">
      <span className="z-10 flex shrink-0 items-center gap-2 bg-black py-2.5 pr-4 font-sans text-xs font-bold text-tag">
        <span className="ticker__dot inline-block size-2 rounded-full bg-tag" aria-hidden="true" />
        Son haberler
      </span>
      <div className="ticker__viewport relative flex-1 overflow-hidden py-2.5">
        <div className="ticker__track flex w-max">
          {row(false)}
          {row(true)}
        </div>
      </div>
    </div>
  );
}
