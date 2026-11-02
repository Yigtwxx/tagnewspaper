'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { LogoMark, Wordmark } from '@/components/Logo';
import { relativeTime } from '@/lib/format';
import { useNow, useScrolledPast } from '@/lib/hooks';

const NAV = [
  { href: '/#haberler', label: 'Gazete' },
  { href: '/#dava', label: 'Dava' },
  { href: '/#veriler', label: 'Veriler' },
  { href: '/#borsa', label: 'Borsa' },
  { href: '/#kunye', label: 'Künye' },
] as const;

/** Site bar with tabs. On the front page it slides in after the nameplate; elsewhere it stays. */
export function TopBar({
  lastRunAt,
  hasData,
  alwaysShown = false,
}: {
  lastRunAt: string;
  hasData: boolean;
  alwaysShown?: boolean;
}) {
  const scrolled = useScrolledPast(0.42);
  const shown = alwaysShown || scrolled;
  const now = useNow();
  const pathname = usePathname();

  return (
    <div
      id="topbar"
      data-theme="ink"
      className={`fixed inset-x-0 top-0 z-50 border-b border-(--line) transition-[transform,background-color,color] duration-300 ${shown ? 'translate-y-0' : '-translate-y-full'}`}
      inert={!shown}
    >
      <div className="flex h-14 items-center justify-between gap-4 px-4 sm:px-8">
        <Link
          href="/"
          onClick={(e) => {
            if (pathname !== '/') return;
            // Same page: Next would not move, so scroll back to the nameplate ourselves.
            e.preventDefault();
            history.replaceState(null, '', '/');
            if (window.__lenis) window.__lenis.scrollTo(0);
            else window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
          className="flex shrink-0 items-center gap-2"
          aria-label="The TAG Newspaper, ön sayfa"
        >
          <LogoMark className="size-8" />
          <Wordmark className="hidden text-[1.45rem] sm:inline" />
        </Link>
        <nav
          aria-label="Sekmeler"
          className="no-scrollbar min-w-0 overflow-y-hidden max-md:overflow-x-auto"
        >
          <ul className="flex gap-4 font-sans text-sm whitespace-nowrap sm:gap-6">
            {NAV.map((item) => {
              const current = pathname === '/borsa' && item.href === '/#borsa';
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={`border-b-2 pb-0.5 transition-opacity ${
                      current
                        ? 'border-(--accent-text) font-semibold'
                        : 'border-transparent opacity-75 hover:opacity-100'
                    }`}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <p className="meta hidden whitespace-nowrap lg:block">
          {hasData && now !== undefined ? `Güncellendi: ${relativeTime(lastRunAt, now)}` : ''}
        </p>
      </div>
    </div>
  );
}
