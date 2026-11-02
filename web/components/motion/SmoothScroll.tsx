'use client';

import Lenis from 'lenis';

import { useEffect } from 'react';

import { gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';

declare global {
  interface Window {
    /** The page's Lenis instance, for code that needs to scroll programmatically. */
    __lenis?: Lenis;
  }
}

/** Lenis smooth scroll driven by GSAP's ticker so ScrollTrigger stays in sync. */
export function SmoothScroll() {
  useEffect(() => {
    registerGsap();
    const refresh = () => ScrollTrigger.refresh();
    void document.fonts?.ready.then(refresh);

    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ lerp: 0.12, anchors: { offset: -56 } });
    lenis.on('scroll', ScrollTrigger.update);
    window.__lenis = lenis;
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
      window.__lenis = undefined;
    };
  }, []);

  return null;
}
