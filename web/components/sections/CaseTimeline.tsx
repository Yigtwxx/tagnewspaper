'use client';

import { useGSAP } from '@gsap/react';
import { useRef, useState } from 'react';

import { formatCalendarDate } from '@/lib/format';
import { useReducedMotion } from '@/lib/hooks';
import { gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';
import type { CaseEventT } from '@/lib/schema';

import { FlapCell } from '../hero/FlapCell';
import { SectionMargins } from '../SectionMargins';

const TYPE_LABEL: Record<CaseEventT['type'], string> = {
  court_decision: 'Mahkeme kararı',
  filing: 'Dava ve başvuru',
  regulation: 'Düzenleme',
  statement: 'Açıklama',
  other: 'Gelişme',
};

const MONTHS = new Intl.DateTimeFormat('tr-TR', { month: 'long', timeZone: 'UTC' });

function monthName(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  return MONTHS.format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * "Dava nerede?": the dispute from the first filing to today. A split-flap year counter stays
 * pinned on the left and flips to the year of whichever event is in focus; the black track on
 * the right fills as you read down.
 */
export function CaseTimeline({
  events,
  runningHead,
}: {
  events: CaseEventT[];
  runningHead: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const [active, setActive] = useState(Math.max(0, events.length - 1));
  const animateFlaps = !useReducedMotion();

  useGSAP(
    () => {
      registerGsap();
      const list = listRef.current;
      if (!list || events.length === 0) return;
      const items = gsap.utils.toArray<HTMLElement>('.tl-event', list);

      items.forEach((item, i) => {
        ScrollTrigger.create({
          trigger: item,
          start: 'top 60%',
          end: 'bottom 60%',
          onToggle: (self) => {
            if (self.isActive) setActive(i);
          },
        });
      });

      if (prefersReducedMotion()) return;

      gsap.fromTo(
        list.querySelector('.tl-fill'),
        { scaleY: 0 },
        {
          scaleY: 1,
          ease: 'none',
          scrollTrigger: { trigger: list, start: 'top 60%', end: 'bottom 60%', scrub: 0.4 },
        },
      );
      for (const item of gsap.utils.toArray<HTMLElement>('.tl-item', list)) {
        gsap.from(item.querySelectorAll('.tl-reveal'), {
          opacity: 0,
          x: 40,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.08,
          scrollTrigger: { trigger: item, start: 'top 82%', once: true },
        });
        gsap.from(item.querySelector('.tl-node'), {
          scale: 0,
          duration: 0.6,
          ease: 'back.out(3)',
          scrollTrigger: { trigger: item, start: 'top 70%', once: true },
        });
      }
    },
    { scope: sectionRef, dependencies: [events.length] },
  );

  const current = events[active];
  const year = current ? current.date.slice(0, 4) : '----';
  const latest = events.at(-1);

  return (
    <section
      ref={sectionRef}
      id="dava"
      data-section="case"
      data-theme="tag"
      className="margin-clip relative px-4 py-20 sm:px-8 sm:py-24"
    >
      <SectionMargins index={3} label="Dava" theme="tag" runningHead={runningHead} />
      <div className="mx-auto grid max-w-[1360px] gap-12 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <div className="flex flex-col gap-6 lg:sticky lg:top-20">
            <header className="section-head">
              <h2 className="section-title mt-4">Dava nerede?</h2>
            </header>
            <p className="dek text-black/75">
              Martı TAG ile taksici odaları arasındaki hukuk mücadelesi, ilk günden bugüne. Okudukça
              yıl sayacı ilerler.
            </p>

            <div className="flex flex-col gap-3" aria-hidden="true">
              <div className="flex gap-[5px]">
                {Array.from(year).map((ch, i) => (
                  <FlapCell
                    key={i}
                    char={ch}
                    delay={i * 60}
                    spin={0}
                    animate={animateFlaps}
                    size="lg"
                    tone={i >= 2 ? 'accent' : undefined}
                  />
                ))}
              </div>
              <p className="font-serif text-2xl italic">{current ? monthName(current.date) : ''}</p>
              <p className="kicker">
                {events.length > 0 ? `${active + 1} / ${events.length} gelişme` : ''}
              </p>
            </div>

            {latest && (
              <p className="border-t border-black/30 pt-4 text-[1.05rem] leading-relaxed">
                <span className="font-sans font-bold">
                  Son durum, {formatCalendarDate(latest.date)}:
                </span>{' '}
                {latest.title}
              </p>
            )}
          </div>
        </div>

        <div className="lg:col-span-8">
          {events.length === 0 ? (
            <p className="dek text-black/75">Doğrulanmış bir dava gelişmesi henüz eklenmedi.</p>
          ) : (
            <ol ref={listRef} className="relative flex flex-col gap-16 pl-10 sm:pl-14">
              <span
                className="absolute top-2 bottom-2 left-[9px] w-[3px] bg-black/20"
                aria-hidden="true"
              >
                <span className="tl-fill block h-full w-full origin-top bg-black" />
              </span>
              {events.map((event, i) => (
                <li
                  key={event.id}
                  className={`tl-item tl-event relative flex flex-col gap-3 transition-opacity duration-500 ${
                    i === active ? 'opacity-100' : 'opacity-70'
                  }`}
                >
                  <span
                    className={`tl-node absolute top-1 -left-10 size-[21px] rounded-full border-[3px] border-black transition-colors duration-500 sm:-left-14 ${
                      i <= active ? 'bg-black' : 'bg-tag'
                    }`}
                    aria-hidden="true"
                  />
                  <p className="tl-reveal kicker">
                    <time dateTime={event.date}>{formatCalendarDate(event.date)}</time>
                    <span className="mx-2">|</span>
                    {TYPE_LABEL[event.type]}
                  </p>
                  {event.court && (
                    <p className="tl-reveal font-sans text-sm font-semibold">{event.court}</p>
                  )}
                  <h3 className="tl-reveal headline text-[clamp(1.5rem,2.4vw,2.1rem)]">
                    {event.title}
                  </h3>
                  <p className="tl-reveal body-copy max-w-[40rem] text-black/80">
                    {event.description}
                  </p>
                  {event.evidence.length > 0 && (
                    <p className="tl-reveal font-sans text-sm">
                      Kaynak:{' '}
                      {event.evidence.map((ev, j) => (
                        <span key={ev.url}>
                          {j > 0 && ', '}
                          <a
                            href={ev.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="link-underline"
                          >
                            {ev.source_name}
                          </a>
                        </span>
                      ))}
                    </p>
                  )}
                </li>
              ))}
              <li className="tl-item relative flex flex-col gap-3 pb-2">
                <span
                  className="tl-node absolute top-1 -left-10 size-[21px] animate-pulse rounded-full border-[3px] border-black bg-white sm:-left-14"
                  aria-hidden="true"
                />
                <p className="tl-reveal kicker">Bugün</p>
                <p className="tl-reveal font-serif text-2xl leading-snug">
                  Yeni bir karar çıktığında burada görünecek.
                </p>
                <p className="tl-reveal max-w-[36rem] font-sans text-sm leading-relaxed text-black/75">
                  Bir gelişme ancak birbirinden bağımsız en az iki haber kaynağında ya da mahkeme,
                  kurum veya şirketin kendi açıklamasında geçiyorsa eklenir.
                </p>
              </li>
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
