'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

import { gsap, prefersReducedMotion, registerGsap, ScrollTrigger } from '@/lib/motion';

/** Lenis smooth scroll driven by GSAP's ticker so ScrollTrigger stays in sync. */
export function SmoothScroll() {
  useEffect(() => {
    registerGsap();
    const refresh = () => ScrollTrigger.refresh();
    void document.fonts?.ready.then(refresh);

    if (prefersReducedMotion()) return;

    const lenis = new Lenis({ lerp: 0.12, anchors: { offset: -56 } });
    lenis.on('scroll', ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, []);

  return null;
}
