'use client';

import { useGSAP } from '@gsap/react';

import { gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';

const BAR_OFFSET = 56;

/**
 * Inverse-print transitions. Sections own their colors statically; this only
 * (1) re-themes the fixed top bar to match the section beneath it, and
 * (2) on wide screens, "prints" each inverted section over the previous one with a
 *     scroll-scrubbed clip, revealing the previous color at the edges.
 */
export function ThemeTriggers() {
  useGSAP(() => {
    registerGsap();
    const bar = document.getElementById('topbar');
    const root = document.documentElement;
    const sections = gsap.utils.toArray<HTMLElement>('[data-section]');

    for (const section of sections) {
      ScrollTrigger.create({
        trigger: section,
        start: `top ${BAR_OFFSET}px`,
        end: `bottom ${BAR_OFFSET}px`,
        onToggle: (self) => {
          if (!self.isActive) return;
          const theme = section.dataset.theme ?? 'ink';
          bar?.setAttribute('data-theme', theme);
          bar?.setAttribute('data-current', section.dataset.section ?? '');
          root.style.backgroundColor = getComputedStyle(section).backgroundColor;
        },
      });
    }

    if (prefersReducedMotion()) return;

    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px)', () => {
      for (const section of gsap.utils.toArray<HTMLElement>('[data-wipe]')) {
        gsap.fromTo(
          section,
          { clipPath: 'inset(0% 5% 0% 5%)' },
          {
            clipPath: 'inset(0% 0% 0% 0%)',
            ease: 'none',
            scrollTrigger: { trigger: section, start: 'top bottom', end: 'top 35%', scrub: true },
          },
        );
      }
    });
    return () => mm.revert();
  });

  return null;
}
