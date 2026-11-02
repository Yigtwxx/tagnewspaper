'use client';

import { useEffect, useState } from 'react';

import { useReducedMotion } from '@/lib/hooks';

import { FlapCell } from './hero/FlapCell';

const SECTIONS = [
  { id: 'haberler', label: 'Gündem' },
  { id: 'rakamlar', label: 'Rakamlar' },
  { id: 'dava', label: 'Dava' },
  { id: 'veriler', label: 'Veriler' },
  { id: 'taraflar', label: 'Taraflar' },
  { id: 'borsa', label: 'Borsa' },
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
  market: 'borsa',
  colophon: 'kunye',
};

const NAME_CELLS = 8;

/**
 * Page margins on wide screens (1440px and up). Built narrow (~50px) to fit the ~80px margin.
 * Left: a vertical departure board that flips to the section you are reading (number on top,
 * name letters stacked), with a dot per section below it. Right: a vertical running head, like a printed page. Both take the
 * colors of whichever section is at the middle of the screen.
 */
export function SideRails({ runningHead }: { runningHead: string }) {
  const [active, setActive] = useState<string>('haberler');
  const animate = !useReducedMotion();

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
    return () => io.disconnect();
  }, []);

  const activeIndex = Math.max(
    0,
    SECTIONS.findIndex((s) => s.id === active),
  );
  const name = SECTIONS[activeIndex].label
    .toLocaleUpperCase('tr-TR')
    .padEnd(NAME_CELLS, ' ')
    .slice(0, NAME_CELLS);
  const num = String(activeIndex + 1).padStart(2, '0');

  return (
    <>
      <nav
        id="rail-left"
        data-theme="ink"
        aria-label="Bölüm göstergesi"
        className="rail fixed top-1/2 left-4 z-40 hidden -translate-y-1/2 min-[1440px]:block"
      >
        <div className="board-frame !p-1.5" aria-hidden="true">
          <div className="board flex flex-col items-center gap-[3px]">
            <div className="flex gap-[3px]">
              {Array.from(num).map((ch, i) => (
                <FlapCell
                  key={`n${i}`}
                  char={ch}
                  delay={i * 40}
                  spin={0}
                  animate={animate}
                  size="sm"
                  tone="accent"
                />
              ))}
            </div>
            <span className="my-0.5 h-px w-full bg-white/15" />
            {Array.from(name).map((ch, i) => (
              <FlapCell
                key={`c${i}`}
                char={ch}
                delay={60 + i * 45}
                spin={0}
                animate={animate}
                size="sm"
              />
            ))}
          </div>
        </div>
        <span className="sr-only">Şu an okunan bölüm: {SECTIONS[activeIndex].label}</span>

        <ol className="mt-3 flex flex-col items-center gap-2">
          {SECTIONS.map((s, i) => {
            const on = i === activeIndex;
            const passed = i < activeIndex;
            return (
              <li key={s.id} className="relative">
                <a
                  href={`#${s.id}`}
                  aria-current={on ? 'true' : undefined}
                  aria-label={s.label}
                  className="group flex items-center"
                >
                  <span
                    className={`block rounded-full transition-all duration-500 ${
                      on
                        ? 'size-2.5 bg-tag shadow-[0_0_0_4px_rgb(1_178_81/0.2)]'
                        : passed
                          ? 'size-1.5 bg-(--fg) opacity-70 group-hover:size-2.5'
                          : 'size-1.5 bg-(--fg) opacity-25 group-hover:size-2.5 group-hover:opacity-60'
                    }`}
                    aria-hidden="true"
                  />
                  <span className="pointer-events-none absolute left-5 rounded-sm bg-(--fg) px-2 py-0.5 font-sans text-[11px] whitespace-nowrap text-(--bg) opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                    {s.label}
                  </span>
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
        className="rail pointer-events-none fixed top-1/2 right-5 z-40 hidden -translate-y-1/2 min-[1440px]:block"
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
