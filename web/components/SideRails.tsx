'use client';

import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'haberler', label: 'Gündem' },
  { id: 'rakamlar', label: 'Rakamlar' },
  { id: 'dava', label: 'Dava' },
  { id: 'veriler', label: 'Veriler' },
  { id: 'taraflar', label: 'Taraflar' },
  { id: 'kunye', label: 'Künye' },
] as const;

/**
 * Page margins on wide screens (2xl and up only): a section index on the left that marks
 * where the reader is, and a vertical running head on the right, like a printed page.
 * Both take the colors of whichever section is at the middle of the screen.
 */
export function SideRails({ runningHead }: { runningHead: string }) {
  const [active, setActive] = useState<string>('haberler');

  useEffect(() => {
    // Every page section maps to one index entry; the data sections all count as "Veriler".
    const toIndex: Record<string, string> = {
      feed: 'haberler',
      numbers: 'rakamlar',
      case: 'dava',
      density: 'veriler',
      sources: 'veriler',
      topics: 'veriler',
      actors: 'taraflar',
      colophon: 'kunye',
    };
    const rails = ['rail-left', 'rail-right']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (!hit) return;
        const el = hit.target as HTMLElement;
        const index = toIndex[el.dataset.section ?? ''];
        if (index) setActive(index);
        // The rails sit at mid-height, so they take the colors of the section at the centre.
        rails.forEach((r) => r.setAttribute('data-theme', el.dataset.theme ?? 'ink'));
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <nav
        id="rail-left"
        data-theme="ink"
        aria-label="Bölüm göstergesi"
        className="rail pointer-events-auto fixed top-1/2 left-6 z-40 hidden -translate-y-1/2 bg-transparent 2xl:block"
      >
        <ol className="flex flex-col gap-3 border-l border-(--line) pl-3 font-sans text-[12px]">
          {SECTIONS.map((s) => {
            const on = active === s.id;
            return (
              <li key={s.id} className="relative">
                <span
                  className={`absolute top-1/2 -left-[13.5px] h-4 w-[3px] -translate-y-1/2 rounded-full transition-colors duration-300 ${
                    on ? 'bg-tag' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
                <a
                  href={`#${s.id}`}
                  aria-current={on ? 'true' : undefined}
                  className={`transition-[color,opacity] duration-300 ${
                    on
                      ? 'font-semibold text-(--accent-text) opacity-100'
                      : 'opacity-55 hover:opacity-100'
                  }`}
                >
                  {s.label}
                </a>
              </li>
            );
          })}
        </ol>
      </nav>
      <div
        id="rail-right"
        data-theme="ink"
        aria-hidden="true"
        className="rail pointer-events-none fixed top-1/2 right-6 z-40 hidden -translate-y-1/2 bg-transparent 2xl:block"
      >
        <p className="flex rotate-180 items-center gap-3 font-sans text-[11px] tracking-[0.18em] whitespace-nowrap opacity-60 [writing-mode:vertical-rl]">
          <span className="font-blackletter text-[15px] tracking-normal opacity-100">
            The TAG Newspaper
          </span>
          <span className="h-10 w-px bg-current opacity-50" />
          <span>{runningHead}</span>
        </p>
      </div>
    </>
  );
}
