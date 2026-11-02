'use client';

import { useRef, useState } from 'react';

import { CATEGORY_LABEL } from '@/lib/labels';
import { Flip, gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';
import { type ArticleViewT, CATEGORIES, type CategoryT, NewsPage } from '@/lib/schema';

import { NewsBox } from './NewsBox';

type Filter = CategoryT | 'all';

const PAGE = 12;

export function FeedClient({
  initial,
  initialCursor,
}: {
  initial: ArticleViewT[];
  initialCursor: string | undefined;
}) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<Filter>('all');
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const gridRef = useRef<HTMLDivElement>(null);

  const present = new Set(items.map((a) => a.category));
  const visible = filter === 'all' ? items : items.filter((a) => a.category === filter);

  function animateLayout(update: () => void) {
    const grid = gridRef.current;
    if (!grid || prefersReducedMotion()) {
      update();
      return;
    }
    registerGsap();
    const state = Flip.getState(grid.querySelectorAll('[data-flip-id]'));
    update();
    requestAnimationFrame(() => {
      Flip.from(state, {
        duration: 0.55,
        ease: 'power3.inOut',
        absolute: true,
        onEnter: (els) =>
          gsap.fromTo(
            els,
            { opacity: 0, y: 24 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' },
          ),
        onLeave: (els) => gsap.to(els, { opacity: 0, duration: 0.2 }),
        onComplete: () => ScrollTrigger.refresh(),
      });
    });
  }

  async function loadMore() {
    if (!cursor || loading) return;
    setLoading(true);
    setError(undefined);
    try {
      const params = new URLSearchParams({ cursor, limit: String(PAGE) });
      const res = await fetch(`/api/news?${params.toString()}`);
      if (!res.ok) throw new Error(String(res.status));
      const page = NewsPage.parse(await res.json());
      setItems((prev) => {
        const seen = new Set(prev.map((a) => a.id));
        return [...prev, ...page.items.filter((a) => !seen.has(a.id))];
      });
      setCursor(page.next_cursor ?? undefined);
      requestAnimationFrame(() => ScrollTrigger.refresh());
    } catch {
      setError('Haberler yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  }

  const chips: Filter[] = ['all', ...CATEGORIES.filter((c) => present.has(c))];

  return (
    <div>
      <div
        className="mb-6 flex flex-wrap gap-x-6 gap-y-2"
        role="group"
        aria-label="Konuya göre süz"
      >
        {chips.map((c) => {
          const active = filter === c;
          return (
            <button
              key={c}
              type="button"
              aria-pressed={active}
              onClick={() => animateLayout(() => setFilter(c))}
              className={`border-b-2 pb-1 font-sans text-sm transition-colors ${
                active
                  ? 'border-(--fg) font-semibold text-(--fg)'
                  : 'border-transparent text-(--mute) hover:text-(--fg)'
              }`}
            >
              {c === 'all' ? 'Tümü' : CATEGORY_LABEL[c]}
            </button>
          );
        })}
      </div>

      <div className="rule-grid">
        <div
          ref={gridRef}
          className="rule-grid__inner grid-cols-1 sm:auto-rows-[23rem] sm:grid-cols-2 lg:grid-cols-4"
        >
          {visible.map((article) => (
            <div key={article.id} className="rule-cell" data-flip-id={article.id}>
              <NewsBox article={article} />
            </div>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <p className="dek py-10">
          Bu konuda yüklenmiş haber yok. Başka bir konu seçin ya da daha fazla haber yükleyin.
        </p>
      )}

      <div className="mt-16 flex flex-col items-center gap-3">
        {cursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="border border-(--fg) px-7 py-3 font-sans text-sm font-semibold transition-colors hover:bg-(--fg) hover:text-(--bg) disabled:opacity-60"
          >
            {loading ? 'Yükleniyor' : 'Daha fazla haber yükle'}
          </button>
        ) : (
          items.length > 0 && <p className="meta">Arşivdeki bütün haberleri gördünüz.</p>
        )}
        {error && (
          <p className="meta" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
