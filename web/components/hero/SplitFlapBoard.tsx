'use client';

import { useEffect, useRef, useState } from 'react';

import { fitCells } from '@/lib/format';
import { useNow, useReducedMotion } from '@/lib/hooks';

import { FlapCell } from './FlapCell';

export interface BoardRow {
  id: string;
  url: string;
  /** Pre-formatted HH:MM in Europe/Istanbul (server-side, so hydration matches). */
  time: string;
  source: string;
  title: string;
  publishedAt: string;
}

const MASTHEAD = 'TAGNEWSPAPER';
const ROWS = 6;
const W_TIME = 5;
const W_SOURCE = 10;
const W_TITLE = 30;
const PAGE_MS = 9_000;
const NEW_MS = 2 * 60 * 60 * 1000;

function Cells({
  text,
  row,
  offset,
  animate,
  tone,
}: {
  text: string;
  row: number;
  offset: number;
  animate: boolean;
  tone?: 'accent' | 'dim';
}) {
  return (
    <>
      {Array.from(text).map((ch, i) => (
        <FlapCell
          // Position-keyed on purpose: a cell is a physical slot on the board.
          key={i}
          char={ch}
          delay={260 + row * 110 + (offset + i) * 16}
          spin={2 + (((offset + i) * 7 + row * 3) % 5)}
          animate={animate}
          tone={tone}
        />
      ))}
    </>
  );
}

export function SplitFlapBoard({ rows }: { rows: BoardRow[] }) {
  const animate = !useReducedMotion();
  const now = useNow();
  const [page, setPage] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const pages = Math.max(1, Math.ceil(rows.length / ROWS));

  // Cycle through pages like a departure board, only while visible.
  useEffect(() => {
    if (!animate || pages < 2 || !rootRef.current) return;
    let visible = true;
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    io.observe(rootRef.current);
    const timer = window.setInterval(() => {
      if (visible && document.visibilityState === 'visible') setPage((p) => (p + 1) % pages);
    }, PAGE_MS);
    return () => {
      io.disconnect();
      window.clearInterval(timer);
    };
  }, [animate, pages]);

  const visibleRows: Array<BoardRow | undefined> = Array.from(
    { length: ROWS },
    (_, i) => rows[page * ROWS + i],
  );

  return (
    <div ref={rootRef} className="board w-full">
      <div className="flex justify-center gap-[3px] sm:gap-[5px]" aria-hidden="true">
        {Array.from(MASTHEAD).map((ch, i) => (
          <FlapCell
            key={i}
            char={ch}
            delay={i * 70}
            spin={4 + (i % 4)}
            animate={animate}
            size="xl"
            tone={i < 3 ? 'accent' : undefined}
          />
        ))}
      </div>

      <div className="mx-auto mt-8 w-fit sm:mt-12">
        <div
          className="board-head mb-2 flex gap-3 font-sans text-[11px] tracking-[0.12em] text-ash"
          aria-hidden="true"
        >
          <span className="w-[calc(5*var(--w)+4*var(--gap))]">SAAT</span>
          <span className="col-source w-[calc(10*var(--w)+9*var(--gap))]">KAYNAK</span>
          <span>BAŞLIK</span>
        </div>

        <ol className="flex flex-col gap-[6px]" aria-label="Son haberler">
          {visibleRows.map((row, r) => {
            const fresh = row && now !== undefined && now - Date.parse(row.publishedAt) < NEW_MS;
            const cells = (
              <>
                <span className="col-time flex gap-[var(--gap)]">
                  <Cells
                    text={fitCells(row?.time ?? '', W_TIME)}
                    row={r}
                    offset={0}
                    animate={animate}
                    tone="dim"
                  />
                </span>
                <span className="col-source flex gap-[var(--gap)]">
                  <Cells
                    text={fitCells(row?.source ?? '', W_SOURCE)}
                    row={r}
                    offset={W_TIME}
                    animate={animate}
                  />
                </span>
                <span className="col-title flex gap-[var(--gap)]">
                  <Cells
                    text={fitCells(
                      row?.title ?? (r === 0 && rows.length === 0 ? 'HABERLER HAZIRLANIYOR' : ''),
                      W_TITLE,
                    )}
                    row={r}
                    offset={W_TIME + W_SOURCE}
                    animate={animate}
                  />
                </span>
                <span
                  className={`ml-1 inline-block size-2.5 self-center rounded-full ${fresh ? 'bg-tag shadow-[0_0_12px_#01b251]' : 'bg-[#2a2a2a]'}`}
                  aria-hidden="true"
                />
              </>
            );
            return (
              <li key={r} className="board-row flex">
                {row ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-sm outline-offset-4 transition-opacity hover:opacity-80"
                    aria-label={`${row.time}, ${row.source}: ${row.title}${fresh ? ' (yeni)' : ''}`}
                  >
                    {cells}
                  </a>
                ) : (
                  <div className="flex items-center gap-3" aria-hidden="true">
                    {cells}
                  </div>
                )}
              </li>
            );
          })}
        </ol>

        {pages > 1 && (
          <p className="meta mt-4 text-right" aria-live="off">
            {page + 1}/{pages}
          </p>
        )}
      </div>
    </div>
  );
}
