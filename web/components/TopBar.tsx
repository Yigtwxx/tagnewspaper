'use client';

import { relativeTime } from '@/lib/format';
import { useNow, useScrolledPast } from '@/lib/hooks';

const NAV = [
  { href: '#haberler', id: 'feed', label: 'Haberler' },
  { href: '#rakamlar', id: 'numbers', label: 'Rakamlar' },
  { href: '#dava', id: 'case', label: 'Dava' },
  { href: '#veriler', id: 'density', label: 'Veriler' },
  { href: '#taraflar', id: 'actors', label: 'Taraflar' },
  { href: '#kunye', id: 'colophon', label: 'Künye' },
];

/** Fixed bar that appears after the hero; ThemeTriggers re-themes it per section. */
export function TopBar({ lastRunAt, hasData }: { lastRunAt: string; hasData: boolean }) {
  const shown = useScrolledPast(0.42);
  const now = useNow();

  return (
    <div
      id="topbar"
      data-theme="ink"
      className={`fixed inset-x-0 top-0 z-50 border-b border-(--line) transition-[transform,background-color,color] duration-300 ${shown ? 'translate-y-0' : '-translate-y-full'}`}
      inert={!shown}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-8">
        <a href="#top" className="font-serif text-lg font-bold">
          <span className="text-(--accent-text)">TAG</span>NEWSPAPER
        </a>
        <nav aria-label="Bölümler" className="hidden md:block">
          <ul className="flex gap-6 font-sans text-sm">
            {NAV.map((item) => (
              <li key={item.id}>
                <a href={item.href} className="opacity-80 transition-opacity hover:opacity-100">
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <p className="meta whitespace-nowrap">
          {hasData && now !== undefined ? `Güncellendi: ${relativeTime(lastRunAt, now)}` : ''}
        </p>
      </div>
    </div>
  );
}
