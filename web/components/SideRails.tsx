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

/** Every page section maps to one index entry; the data sections all count as "Veriler". */
const TO_INDEX: Record<string, string> = {
  feed: 'haberler',
  numbers: 'rakamlar',
  case: 'dava',
  density: 'veriler',
  sources: 'veriler',
  topics: 'veriler',
  actors: 'taraflar',
  colophon: 'kunye',
};

/**
 * Page margins on wide screens (1800px and up, where the margins can hold them). Left: a reading path with a node per
 * section; the track fills green as you read and the current section's name grows into a
 * serif headline. Right: a vertical running head, like a printed page. Both take the colors
 * of whichever section is at the middle of the screen.
 */
export function SideRails({ runningHead }: { runningHead: string }) {
  const [active, setActive] = useState<string>('haberler');
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const rails = ['rail-left', 'rail-right']
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((e) => e.isIntersecting);
        if (!hit) return;
        const el = hit.target as HTMLElement;
        const index = TO_INDEX[el.dataset.section ?? ''];
        if (index) setActive(index);
        rails.forEach((r) => r.setAttribute('data-theme', el.dataset.theme ?? 'ink'));
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    els.forEach((el) => io.observe(el));

    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, window.scrollY / max) : 0);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const activeIndex = SECTIONS.findIndex((s) => s.id === active);

  return (
    <>
      <nav
        id="rail-left"
        data-theme="ink"
        aria-label="Bölüm göstergesi"
        className="rail fixed top-1/2 left-7 z-40 hidden -translate-y-1/2 min-[1800px]:block"
      >
        <div className="relative pl-7">
          <span
            className="absolute top-2 bottom-2 left-[7px] w-[2px] rounded-full bg-(--line)"
            aria-hidden="true"
          >
            <span
              className="block w-full rounded-full bg-tag transition-[height] duration-300"
              style={{ height: `${progress * 100}%` }}
            />
          </span>
          <ol className="flex flex-col gap-5">
            {SECTIONS.map((s, i) => {
              const on = i === activeIndex;
              const passed = i < activeIndex;
              return (
                <li key={s.id} className="relative">
                  <span
                    className={`absolute top-1/2 -translate-y-1/2 rounded-full border-2 transition-all duration-500 ${
                      on
                        ? 'left-[-27px] size-[18px] border-tag bg-tag shadow-[0_0_0_6px_rgb(1_178_81/0.18)]'
                        : passed
                          ? 'left-[-23px] size-[10px] border-tag bg-tag'
                          : 'left-[-23px] size-[10px] border-(--mute) bg-(--bg)'
                    }`}
                    aria-hidden="true"
                  />
                  <a
                    href={`#${s.id}`}
                    aria-current={on ? 'true' : undefined}
                    className="group flex flex-col"
                  >
                    <span className="font-sans text-[10px] tracking-[0.16em] tabular-nums opacity-50">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`origin-left transition-all duration-500 ${
                        on
                          ? 'translate-x-1 font-serif text-[1.35rem] leading-tight font-bold text-(--accent-text)'
                          : 'font-sans text-[0.95rem] opacity-60 group-hover:translate-x-1 group-hover:opacity-100'
                      }`}
                    >
                      {s.label}
                    </span>
                  </a>
                </li>
              );
            })}
          </ol>
        </div>
      </nav>
      <div
        id="rail-right"
        data-theme="ink"
        aria-hidden="true"
        className="rail pointer-events-none fixed top-1/2 right-7 z-40 hidden -translate-y-1/2 min-[1800px]:block"
      >
        <p className="flex rotate-180 items-center gap-4 font-sans text-[11px] tracking-[0.18em] whitespace-nowrap opacity-65 [writing-mode:vertical-rl]">
          <span className="font-blackletter text-[17px] tracking-normal">The TAG Newspaper</span>
          <span className="h-12 w-px bg-current opacity-50" />
          <span>{runningHead}</span>
        </p>
      </div>
    </>
  );
}
