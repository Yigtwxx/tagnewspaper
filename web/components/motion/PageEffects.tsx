'use client';

import { useGSAP } from '@gsap/react';
import { SplitText } from 'gsap/SplitText';

import { gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';

/**
 * Page-wide scroll effects, all progressive enhancement over a complete static page:
 * - a reading-progress rule in TAG green,
 * - section titles rise line by line from behind a mask,
 * - ruled story boxes appear in batches while their rules draw in.
 */
export function PageEffects() {
  useGSAP(() => {
    registerGsap();
    gsap.registerPlugin(SplitText);

    const bar = document.querySelector<HTMLElement>('.reading-progress');
    if (bar) {
      ScrollTrigger.create({
        start: 0,
        end: 'max',
        onUpdate: (self) => {
          bar.style.transform = `scaleX(${self.progress})`;
        },
      });
    }

    if (prefersReducedMotion()) return;

    for (const title of gsap.utils.toArray<HTMLElement>('.section-title')) {
      SplitText.create(title, {
        type: 'lines',
        mask: 'lines',
        autoSplit: true,
        onSplit: (self) =>
          gsap.from(self.lines, {
            yPercent: 110,
            duration: 0.9,
            ease: 'power4.out',
            stagger: 0.08,
            scrollTrigger: { trigger: title, start: 'top 88%', once: true },
          }),
      });
    }

    for (const dek of gsap.utils.toArray<HTMLElement>('.section-head .dek')) {
      gsap.from(dek, {
        opacity: 0,
        y: 16,
        duration: 0.8,
        ease: 'power2.out',
        scrollTrigger: { trigger: dek, start: 'top 90%', once: true },
      });
    }

    const cells = gsap.utils.toArray<HTMLElement>('.rule-cell');
    if (cells.length === 0) return;
    gsap.set(cells, { '--rule-p': 0 });
    ScrollTrigger.batch(cells, {
      start: 'top 92%',
      once: true,
      onEnter: (batch) => {
        gsap.from(batch, {
          opacity: 0,
          y: 28,
          duration: 0.7,
          ease: 'power3.out',
          stagger: 0.07,
        });
        gsap.to(batch, { '--rule-p': 1, duration: 1.1, ease: 'power2.inOut', stagger: 0.07 });
      },
    });
  });

  return <div className="reading-progress" aria-hidden="true" />;
}
