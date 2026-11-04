'use client';

import { useGSAP } from '@gsap/react';
import { useId, useRef, useState } from 'react';

import { caseOverview, splitSentences } from '@/lib/case';
import { formatCalendarDate, formatDate } from '@/lib/format';
import { useNow, useReducedMotion } from '@/lib/hooks';
import { gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';
import type { ArticleViewT, CaseEventT } from '@/lib/schema';

import { ArticleLink } from '../feed/ArticleLink';
import { AllegationBadge } from '../feed/NewsBox';
import { FlapCell } from '../hero/FlapCell';
import { SectionMargins } from '../SectionMargins';

const TYPE_LABEL: Record<CaseEventT['type'], string> = {
  court_decision: 'Mahkeme kararı',
  filing: 'Dava ve başvuru',
  regulation: 'Düzenleme',
  statement: 'Açıklama',
  other: 'Gelişme',
};

const DAY_MS = 86_400_000;
const RELATED_NEWS = 3;

function Sources({ evidence }: { evidence: CaseEventT['evidence'] }) {
  if (evidence.length === 0) return null;
  return (
    <p className="font-sans text-sm">
      Kaynak:{' '}
      {evidence.map((ev, j) => (
        <span key={ev.url}>
          {j > 0 && ', '}
          <a href={ev.url} target="_blank" rel="noopener noreferrer" className="link-underline">
            {ev.source_name}
          </a>
        </span>
      ))}
    </p>
  );
}

/** Days since the lead event, on split-flap cells; the count moves once a day. */
function DaysSince({ date, decision }: { date: string; decision: boolean }) {
  const now = useNow();
  const animate = !useReducedMotion();
  const days =
    now === undefined
      ? undefined
      : Math.max(0, Math.floor((now - Date.parse(`${date}T00:00:00+03:00`)) / DAY_MS));
  const digits = days === undefined ? '--' : String(days).padStart(2, '0');
  return (
    <div className="flex flex-col gap-3 border-t border-black/30 pt-5">
      <p className="font-serif text-xl italic">
        {decision ? 'Kararın üzerinden' : 'Son gelişmenin üzerinden'}
      </p>
      <div className="flex gap-[5px]" aria-hidden="true">
        {Array.from(digits).map((ch, i) => (
          <FlapCell
            key={`${digits.length}-${i}`}
            char={ch}
            delay={i * 80}
            spin={2}
            animate={animate}
            size="lg"
          />
        ))}
      </div>
      <p className="kicker">gün geçti</p>
      {days !== undefined && <p className="sr-only">{days} gün geçti</p>}
    </div>
  );
}

/** Everything before the lead event, newest first, folded away until the reader asks. */
function CaseArchive({ events }: { events: CaseEventT[] }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const years: [string, CaseEventT[]][] = [];
  for (const event of events) {
    const year = event.date.slice(0, 4);
    const last = years.at(-1);
    if (last && last[0] === year) last[1].push(event);
    else years.push([year, [event]]);
  }

  const toggle = () => {
    const panel = panelRef.current;
    if (!panel) return;
    const next = !open;
    setOpen(next);
    if (prefersReducedMotion()) {
      gsap.set(panel, { height: next ? 'auto' : 0 });
      ScrollTrigger.refresh();
      return;
    }
    if (next) {
      gsap.fromTo(
        panel,
        { height: 0 },
        {
          height: 'auto',
          duration: 0.8,
          ease: 'power3.inOut',
          onComplete: () => ScrollTrigger.refresh(),
        },
      );
      gsap.fromTo(
        panel.querySelectorAll('.arc-item'),
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.05, delay: 0.2 },
      );
    } else {
      // Bring the toggle back into view first, so the page doesn't jump under the reader.
      if (buttonRef.current) window.__lenis?.scrollTo(buttonRef.current, { offset: -140 });
      gsap.to(panel, {
        height: 0,
        duration: 0.6,
        ease: 'power3.inOut',
        onComplete: () => ScrollTrigger.refresh(),
      });
    }
  };

  return (
    <div className="mt-14">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className="group flex w-full items-center justify-between gap-4 border-y-2 border-black py-4 text-left"
      >
        <span className="font-serif text-[clamp(1.4rem,2.2vw,1.9rem)] font-bold">
          {open ? 'Geçmişi kapat' : 'Davanın geçmişi'}
        </span>
        <span className="flex items-center gap-4">
          <span className="meta text-black/75">{events.length} gelişme</span>
          <span
            className={`relative size-5 transition-transform duration-500 ${open ? 'rotate-45' : ''}`}
            aria-hidden="true"
          >
            <span className="absolute top-1/2 left-0 h-[2px] w-full -translate-y-1/2 bg-black" />
            <span className="absolute top-0 left-1/2 h-full w-[2px] -translate-x-1/2 bg-black" />
          </span>
        </span>
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className="h-0 overflow-hidden"
        inert={!open}
        aria-hidden={!open}
      >
        <div className="flex flex-col gap-10 pt-8">
          {years.map(([year, items]) => (
            <div key={year} className="grid gap-x-8 gap-y-4 sm:grid-cols-[6rem_1fr]">
              <p className="arc-item font-serif text-4xl leading-none font-bold">{year}</p>
              <ol className="flex flex-col">
                {items.map((event) => (
                  <li
                    key={event.id}
                    className="arc-item flex flex-col gap-2 border-t border-black/25 py-5 first:border-t-0 first:pt-0"
                  >
                    <p className="kicker">
                      <time dateTime={event.date}>{formatCalendarDate(event.date)}</time>
                      <span className="mx-2">|</span>
                      {TYPE_LABEL[event.type]}
                    </p>
                    {event.court && (
                      <p className="font-sans text-sm font-semibold">{event.court}</p>
                    )}
                    <h4 className="font-serif text-xl leading-snug font-bold">{event.title}</h4>
                    <p className="body-copy max-w-[40rem] text-black/80">{event.description}</p>
                    <Sources evidence={event.evidence} />
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * "Dava nerede?": the latest court decision first, set out point by point, then what has
 * happened since and the latest case news. The full history stays folded below.
 */
export function CaseTimeline({
  events,
  articles,
  runningHead,
}: {
  events: CaseEventT[];
  articles: ArticleViewT[];
  runningHead: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const overview = caseOverview(events);
  const news = articles
    .filter((a) => a.category === 'dava' && a.display !== 'hidden')
    .slice(0, RELATED_NEWS);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !sectionRef.current) return;
      registerGsap();
      for (const block of gsap.utils.toArray<HTMLElement>('.cl-block', sectionRef.current)) {
        gsap.from(block.querySelectorAll('.cl-reveal'), {
          opacity: 0,
          y: 24,
          duration: 0.8,
          ease: 'power3.out',
          stagger: 0.08,
          scrollTrigger: { trigger: block, start: 'top 82%', once: true },
        });
      }
    },
    { scope: sectionRef, dependencies: [events.length] },
  );

  const featured = overview?.featured;
  const decision = featured?.type === 'court_decision';

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
              Martı TAG ile taksici odaları arasındaki davada son durum. Önceki gelişmeler en altta,
              davanın geçmişinde.
            </p>
            {featured && <DaysSince date={featured.date} decision={decision} />}
          </div>
        </div>

        <div className="lg:col-span-8">
          {!overview || !featured ? (
            <p className="dek text-black/75">Doğrulanmış bir dava gelişmesi henüz eklenmedi.</p>
          ) : (
            <>
              <article className="cl-block flex flex-col gap-4">
                <p className="cl-reveal kicker">
                  {decision ? 'Son karar' : 'Son gelişme'}
                  <span className="mx-2">|</span>
                  <time dateTime={featured.date}>{formatCalendarDate(featured.date)}</time>
                </p>
                {featured.court && (
                  <p className="cl-reveal font-sans text-sm font-semibold">{featured.court}</p>
                )}
                <h3 className="cl-reveal headline text-[clamp(2rem,3.6vw,3.25rem)]">
                  {featured.title}
                </h3>
                <div className="cl-reveal mt-2 border-t-2 border-black pt-4">
                  <p className="font-sans text-sm font-bold">
                    {decision ? 'Kararda neler var?' : 'Ayrıntılar'}
                  </p>
                  <ul className="mt-4 flex flex-col gap-3.5">
                    {splitSentences(featured.description).map((point) => (
                      <li key={point} className="flex gap-3.5">
                        <span
                          className="mt-[0.62em] size-[7px] shrink-0 bg-black"
                          aria-hidden="true"
                        />
                        <span className="body-copy max-w-[42rem] text-black/85">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="cl-reveal">
                  <Sources evidence={featured.evidence} />
                </div>
              </article>

              {overview.after.length > 0 && (
                <div className="cl-block mt-14">
                  <p className="cl-reveal border-t border-black/40 pt-4 font-sans text-sm font-bold">
                    {decision ? 'Karardan sonra' : 'Sonrasında'}
                  </p>
                  <ol className="flex flex-col">
                    {overview.after.map((event) => (
                      <li
                        key={event.id}
                        className="cl-reveal grid gap-x-8 gap-y-2 border-b border-black/25 py-5 last:border-b-0 sm:grid-cols-[7rem_1fr]"
                      >
                        <p className="kicker">
                          <time dateTime={event.date}>
                            {formatCalendarDate(event.date, { year: false })}
                          </time>
                        </p>
                        <div className="flex flex-col gap-2">
                          <h4 className="font-serif text-xl leading-snug font-bold">
                            {event.title}
                          </h4>
                          <p className="body-copy max-w-[40rem] text-black/80">
                            {event.description}
                          </p>
                          <Sources evidence={event.evidence} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {news.length > 0 && (
                <div className="cl-block mt-14">
                  <p className="cl-reveal border-t border-black/40 pt-4 font-sans text-sm font-bold">
                    Davayla ilgili son haberler
                  </p>
                  <ul className="flex flex-col">
                    {news.map((a) => (
                      <li key={a.id} className="cl-reveal border-b border-black/25 last:border-b-0">
                        <ArticleLink article={a} className="group flex flex-col gap-1.5 py-4">
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-sans text-[13px] text-black/75">
                            {formatDate(a.published_at, { year: false })}, {a.source.name}
                            {a.is_allegation && <AllegationBadge />}
                          </span>
                          <span className="font-serif text-lg leading-snug font-bold group-hover:underline">
                            {a.title}
                          </span>
                        </ArticleLink>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {overview.earlier.length > 0 && <CaseArchive events={overview.earlier} />}

              <p className="mt-8 max-w-[36rem] font-sans text-sm leading-relaxed text-black/75">
                Bir gelişme ancak birbirinden bağımsız en az iki haber kaynağında ya da mahkeme,
                kurum veya şirketin kendi açıklamasında geçiyorsa eklenir.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
