'use client';

import { useGSAP } from '@gsap/react';
import { useRef } from 'react';

import { formatCalendarDate } from '@/lib/format';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';
import type { CaseEventT } from '@/lib/schema';

const TYPE_LABEL: Record<CaseEventT['type'], string> = {
  court_decision: 'Mahkeme kararı',
  filing: 'Başvuru',
  regulation: 'Düzenleme',
  statement: 'Açıklama',
  other: 'Gelişme',
};

function EventCard({ event, index }: { event: CaseEventT; index: number }) {
  const [y, m, d] = event.date.split('-');
  return (
    <li className="tl-card relative flex w-full shrink-0 flex-col gap-4 lg:w-[min(34rem,42vw)]">
      <div className="flex items-center gap-4">
        <span className="tl-node relative z-10 inline-block size-5 rounded-full border-[3px] border-black bg-tag" />
        <span className="font-sans text-sm font-semibold">
          {String(index + 1).padStart(2, '0')} / {TYPE_LABEL[event.type]}
        </span>
      </div>
      <p className="numeral text-[clamp(3rem,6vw,5.5rem)]">
        <time dateTime={event.date}>
          {d}.{m}.{y}
        </time>
      </p>
      {event.court && <p className="font-sans text-base font-semibold">{event.court}</p>}
      <h3 className="headline text-[clamp(1.6rem,2.4vw,2.2rem)]">{event.title}</h3>
      <p className="max-w-[32rem] text-lg leading-relaxed text-black/80">{event.description}</p>
      {event.evidence.length > 0 && (
        <p className="font-sans text-sm">
          Kaynak:{' '}
          {event.evidence.map((ev, i) => (
            <span key={ev.url}>
              {i > 0 && ', '}
              <a href={ev.url} target="_blank" rel="noopener noreferrer" className="link-underline">
                {ev.source_name}
              </a>
            </span>
          ))}
        </p>
      )}
    </li>
  );
}

export function CaseTimeline({ events }: { events: CaseEventT[] }) {
  const sectionRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLOListElement>(null);
  const latest = events.at(-1);

  useGSAP(
    () => {
      registerGsap();
      const section = sectionRef.current;
      const track = trackRef.current;
      if (!section || !track || prefersReducedMotion()) return;

      const mm = gsap.matchMedia();
      mm.add('(min-width: 1024px)', () => {
        const distance = () => Math.max(0, track.scrollWidth - window.innerWidth + 64);
        if (distance() < 40) return;
        const bar = section.querySelector<HTMLElement>('.tl-progress');
        gsap.to(track, {
          x: () => -distance(),
          ease: 'none',
          scrollTrigger: {
            trigger: section,
            start: 'top top',
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 0.6,
            invalidateOnRefresh: true,
            onUpdate: (self) => {
              if (bar) bar.style.transform = `scaleX(${self.progress})`;
            },
          },
        });
      });
      return () => mm.revert();
    },
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      id="dava"
      data-section="case"
      data-theme="tag"
      className="overflow-hidden px-4 py-28 sm:px-8 lg:flex lg:min-h-[100svh] lg:flex-col lg:justify-center lg:py-20"
    >
      <div className="mx-auto mb-14 grid w-full max-w-[1360px] gap-6 lg:grid-cols-[1fr_minmax(0,30rem)] lg:items-end">
        <h2 className="section-title">Dava nerede?</h2>
        {latest ? (
          <p className="text-[clamp(1.15rem,1.5vw,1.4rem)] leading-relaxed">
            <span className="font-sans font-semibold">
              Son durum, {formatCalendarDate(latest.date)}:
            </span>{' '}
            {latest.title}
          </p>
        ) : (
          <p className="dek">Doğrulanmış bir dava gelişmesi henüz eklenmedi.</p>
        )}
      </div>

      {events.length > 0 && (
        <div className="relative">
          <div
            className="absolute top-[10px] right-0 left-0 hidden h-[3px] bg-black/25 lg:block"
            aria-hidden="true"
          >
            <div
              className="tl-progress h-full origin-left bg-black"
              style={{ transform: 'scaleX(0)' }}
            />
          </div>
          <ol
            ref={trackRef}
            className="flex flex-col gap-16 border-l-[3px] border-black/25 pl-6 will-change-transform lg:flex-row lg:gap-20 lg:border-l-0 lg:pl-[max(2rem,calc((100vw-1360px)/2))]"
          >
            {events.map((event, i) => (
              <EventCard key={event.id} event={event} index={i} />
            ))}
            <li className="flex w-full shrink-0 flex-col justify-end gap-4 lg:w-[min(26rem,34vw)] lg:pr-16">
              <p className="font-serif text-2xl leading-snug">
                Yeni bir karar çıktığında burada görünecek.
              </p>
              <p className="font-sans text-sm leading-relaxed text-black/75">
                Bir gelişme ancak birbirinden bağımsız en az iki haber kaynağında ya da mahkeme,
                kurum veya şirketin kendi açıklamasında geçiyorsa eklenir.
              </p>
            </li>
          </ol>
        </div>
      )}
    </section>
  );
}
