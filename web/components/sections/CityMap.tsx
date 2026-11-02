'use client';

import { useGSAP } from '@gsap/react';
import { useRef, useState } from 'react';

import { useReducedMotion } from '@/lib/hooks';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';
import { MAP_H, MAP_W, TAG_CITIES, TURKEY_OUTLINE } from '@/lib/turkey-map';

import { FlapCell } from '../hero/FlapCell';

const WAVES = [
  {
    wave: 1,
    total: 20,
    label: 'İlk 20 şehir',
    when: '2026 yazına kadar',
    color: '#ffffff',
    source: {
      name: 'Martı basın bülteni',
      url: 'https://ir.marti.tech/news-events/press-releases/detail/112/marti-and-tensor-partner-to-deploy-autonomous-vehicles-in',
    },
  },
  {
    wave: 2,
    total: 30,
    label: '10 yeni şehir',
    when: 'Ağustos 2026',
    color: '#7fd8a8',
    source: {
      name: 'Martı basın bülteni, 12 Ağustos 2026',
      url: 'https://ir.marti.tech/news-events/press-releases/detail/114/marti-technologies-launches-ride-hailing-service-in-10-new',
    },
  },
  {
    wave: 3,
    total: 40,
    label: '10 yeni şehir',
    when: 'Ekim 2026',
    color: '#01b251',
    source: {
      name: 'Martı duyurusu, 28 Ekim 2026',
      url: 'https://www.businesswire.com/news/home/20261028699518/en/',
    },
  },
] as const;

const HUB = TAG_CITIES.find((c) => c.name === 'İstanbul') ?? TAG_CITIES[0];

function arc(x: number, y: number): string {
  const mx = (HUB.x + x) / 2;
  const my = (HUB.y + y) / 2 - Math.hypot(x - HUB.x, y - HUB.y) * 0.22;
  return `M${HUB.x},${HUB.y} Q${mx},${my} ${x},${y}`;
}

/**
 * Where TAG runs. The outline draws in, then each launch wave lights up from Istanbul
 * while a split-flap counter turns 20 → 30 → 40.
 */
export function CityMap() {
  const rootRef = useRef<HTMLDivElement>(null);
  const animateFlaps = !useReducedMotion();
  const [count, setCount] = useState(40);
  const [wave, setWave] = useState<number>(3);
  const [hover, setHover] = useState<string | undefined>(undefined);

  useGSAP(
    () => {
      if (prefersReducedMotion() || !rootRef.current) return;
      registerGsap();
      const root = rootRef.current;
      const outline = root.querySelector<SVGPathElement>('.tr-outline');
      if (!outline) return;
      const len = outline.getTotalLength();

      gsap.set(outline, { strokeDasharray: len, strokeDashoffset: len, fillOpacity: 0 });
      gsap.set(root.querySelectorAll('.city-dot'), { scale: 0, transformOrigin: '50% 50%' });
      gsap.set(root.querySelectorAll('.city-arc'), { opacity: 0 });
      setCount(0);
      setWave(0);

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 70%', once: true },
      });
      tl.to(outline, { strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut' });
      tl.to(outline, { fillOpacity: 1, duration: 0.6 }, '-=0.4');

      for (const w of WAVES) {
        const arcs = gsap.utils.toArray<SVGPathElement>(`.city-arc[data-wave="${w.wave}"]`, root);
        const dots = gsap.utils.toArray<SVGGElement>(`.city-dot[data-wave="${w.wave}"]`, root);
        tl.add(() => {
          setWave(w.wave);
          setCount(w.total);
        });
        arcs.forEach((a) => {
          const l = a.getTotalLength();
          gsap.set(a, { strokeDasharray: l, strokeDashoffset: l, opacity: 1 });
        });
        tl.to(arcs, { strokeDashoffset: 0, duration: 0.9, ease: 'power2.out', stagger: 0.04 });
        tl.to(dots, { scale: 1, duration: 0.5, ease: 'back.out(3)', stagger: 0.04 }, '-=0.6');
        tl.to(arcs, { opacity: 0.18, duration: 0.6 }, '+=0.4');
      }
    },
    { scope: rootRef },
  );

  const hovered = TAG_CITIES.find((c) => c.name === hover);
  const digits = String(count).padStart(2, '0');

  return (
    <div ref={rootRef} className="mt-28 border-t border-white/20 pt-12">
      <div className="grid gap-10 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-4">
          <h3 className="font-serif text-[clamp(1.6rem,2.4vw,2.2rem)] leading-tight font-bold">
            Hangi şehirlerde?
          </h3>
          <div className="flex items-end gap-4" aria-hidden="true">
            <div className="flex gap-[5px]">
              {Array.from(digits).map((ch, i) => (
                <FlapCell
                  key={i}
                  char={ch}
                  delay={i * 80}
                  spin={0}
                  animate={animateFlaps}
                  size="lg"
                  tone="accent"
                />
              ))}
            </div>
            <span className="pb-1 font-serif text-2xl italic">şehir</span>
          </div>
          <p className="sr-only">TAG 40 şehirde hizmet veriyor.</p>
          <ol className="flex flex-col gap-4">
            {WAVES.map((w) => (
              <li
                key={w.wave}
                className={`border-l-2 pl-4 transition-opacity duration-500 ${
                  wave >= w.wave ? 'opacity-100' : 'opacity-30'
                }`}
                style={{ borderColor: w.color }}
              >
                <p className="font-sans text-sm font-bold">
                  {w.when}: <span className="hl">{w.label}</span>
                </p>
                <p className="mt-1 text-[0.98rem] leading-relaxed text-white/80">
                  {TAG_CITIES.filter((c) => c.wave === w.wave)
                    .map((c) => c.name)
                    .join(', ')}
                </p>
                <a
                  href={w.source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="meta link-underline mt-1 inline-block"
                >
                  {w.source.name}
                </a>
              </li>
            ))}
          </ol>
        </div>

        <div className="relative lg:col-span-8">
          <svg
            viewBox={`0 0 ${MAP_W} ${MAP_H}`}
            className="block h-auto w-full overflow-visible"
            role="img"
            aria-label="TAG'ın hizmet verdiği 40 şehrin Türkiye haritası"
          >
            <defs>
              <radialGradient id="city-glow">
                <stop offset="0" stopColor="#01b251" stopOpacity="0.55" />
                <stop offset="1" stopColor="#01b251" stopOpacity="0" />
              </radialGradient>
            </defs>
            <path
              className="tr-outline"
              d={TURKEY_OUTLINE}
              fill="#0f1110"
              stroke="#ffffff"
              strokeOpacity={0.55}
              strokeWidth={1.2}
              strokeLinejoin="round"
            />
            {TAG_CITIES.filter((c) => c !== HUB).map((c) => (
              <path
                key={`arc-${c.name}`}
                className="city-arc"
                data-wave={c.wave}
                d={arc(c.x, c.y)}
                fill="none"
                stroke="#01b251"
                strokeWidth={1.2}
                opacity={0.18}
              />
            ))}
            {TAG_CITIES.map((c) => {
              const color = WAVES[c.wave - 1].color;
              const on = hover === c.name;
              return (
                <g
                  key={c.name}
                  className="city-dot cursor-default"
                  data-wave={c.wave}
                  transform={`translate(${c.x},${c.y})`}
                  onPointerEnter={() => setHover(c.name)}
                  onPointerLeave={() => setHover(undefined)}
                >
                  <circle r={c === HUB ? 26 : 16} fill="url(#city-glow)" />
                  <circle
                    r={c === HUB ? 8 : on ? 7 : 5}
                    fill={color}
                    stroke="#000"
                    strokeWidth={1.5}
                    className="transition-[r] duration-200"
                  />
                  <circle r={14} fill="transparent" />
                </g>
              );
            })}
            {hovered && (
              <g transform={`translate(${hovered.x},${hovered.y - 16})`} pointerEvents="none">
                <text
                  textAnchor="middle"
                  className="fill-white font-sans text-[15px] font-bold"
                  stroke="#000"
                  strokeWidth={4}
                  paintOrder="stroke"
                >
                  {hovered.name}
                </text>
              </g>
            )}
            <text
              x={HUB.x}
              y={HUB.y - 20}
              textAnchor="middle"
              className="pointer-events-none fill-white font-sans text-[14px] font-bold"
              stroke="#000"
              strokeWidth={4}
              paintOrder="stroke"
            >
              İstanbul
            </text>
          </svg>
          <p className="meta mt-3">
            Noktaların üzerine gelince şehir adı görünür. Harita, şirketin duyurduğu hizmet
            şehirlerini gösterir; şehir içindeki kapsama alanını göstermez.
          </p>
        </div>
      </div>
    </div>
  );
}
