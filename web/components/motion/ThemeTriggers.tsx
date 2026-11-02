'use client';

import { useGSAP } from '@gsap/react';

import { gsap, registerGsap, ScrollTrigger } from '@/lib/motion';

const BAR_OFFSET = 56;

/**
 * Keeps the fixed top bar themed like the section beneath it, so it inverts together with
 * the page. Section colors themselves are static (correct without JS or with reduced motion).
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
  });

  return null;
}
