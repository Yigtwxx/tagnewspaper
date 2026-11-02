'use client';

import { useGSAP } from '@gsap/react';
import { useRef, useState } from 'react';

import { useReducedMotion } from '@/lib/hooks';
import { gsap, prefersReducedMotion, registerGsap } from '@/lib/motion';
import { MAP_H, MAP_W, PROVINCES, TURKEY_OUTLINE } from '@/lib/turkey-map';

import { FlapCell } from '../hero/FlapCell';

const WAVES = [
  {
    wave: 1,
    total: 20,
    label: 'İlk 20 şehir',
    when: '2026 yazına kadar',
    color: '#01b251',
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
    color: '#2fc47a',
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
    color: '#8fe3b5',
    source: {
      name: 'Martı duyurusu, 28 Ekim 2026',
      url: 'https://www.businesswire.com/news/home/20261028699518/en/',
    },
  },
] as const;

const TAG = PROVINCES.filter(
  (p): p is Required<typeof p> => p.wave !== undefined && p.x !== undefined,
);
const HUB = TAG.find((p) => p.code === 34) ?? TAG[0];
const BASE_FILL = '#141615';
/** Large enough to cover any province from its centroid. */
const SPREAD_R = 160;

function arc(x: number, y: number): string {
  const mx = (HUB.x + x) / 2;
  const my = (HUB.y + y) / 2 - Math.hypot(x - HUB.x, y - HUB.y) * 0.22;
  return `M${HUB.x},${HUB.y} Q${mx},${my} ${x},${y}`;
}

/**
 * Where TAG runs. Province borders draw in; then, wave by wave, routes leave Istanbul and
 * each province turns green as its route arrives, while a split-flap counter turns to 40.
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
      const borders = root.querySelector('.tr-borders');

      gsap.set(outline, { strokeDasharray: len, strokeDashoffset: len });
      gsap.set(borders, { opacity: 0 });
      gsap.set(root.querySelectorAll('.spread'), { attr: { r: 0 } });
      gsap.set(root.querySelectorAll('.city-arc'), { opacity: 0 });
      setCount(0);
      setWave(0);

      const tl = gsap.timeline({
        scrollTrigger: { trigger: root, start: 'top 80%', once: true },
      });
      tl.to(outline, { strokeDashoffset: 0, duration: 1.5, ease: 'power2.inOut' });
      tl.to(borders, { opacity: 1, duration: 0.6 }, '-=0.5');

      for (const w of WAVES) {
        const members = TAG.filter((p) => p.wave === w.wave);
        const start = tl.duration() + 0.2;
        tl.add(() => {
          setWave(w.wave);
          setCount(w.total);
        }, start);
        members.forEach((p, k) => {
          const a = root.querySelector<SVGPathElement>(`.city-arc[data-code="${p.code}"]`);
          const at = start + k * 0.05;
          if (a) {
            const l = a.getTotalLength();
            tl.fromTo(
              a,
              { strokeDasharray: l, strokeDashoffset: l, opacity: 1 },
              { strokeDashoffset: 0, duration: 0.8, ease: 'power2.out' },
              at,
            );
          }
          // Green spreads out from where the route touches the province, slowly, to its edges.
          const spread = root.querySelector(`.spread[data-code="${p.code}"]`);
          if (spread) {
            tl.fromTo(
              spread,
              { attr: { r: 0 } },
              {
                attr: { r: SPREAD_R },
                duration: 2.4,
                ease: 'power1.inOut',
                immediateRender: false,
              },
              at + 0.7,
            );
          }
        });
        tl.to(
          root.querySelectorAll(`.city-arc[data-wave="${w.wave}"]`),
          { opacity: 0.16, duration: 0.6 },
          '+=0.3',
        );
      }
    },
    { scope: rootRef },
  );

  const hovered = TAG.find((p) => p.name === hover);
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
                  {TAG.filter((p) => p.wave === w.wave)
                    .map((p) => p.name)
                    .sort((a, b) => a.localeCompare(b, 'tr'))
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
              {TAG.map((p) => (
                <clipPath key={p.code} id={`spread-${p.code}`}>
                  <circle className="spread" data-code={p.code} cx={p.x} cy={p.y} r={SPREAD_R} />
                </clipPath>
              ))}
            </defs>
            <g className="tr-borders">
              {PROVINCES.map((p) => (
                <path key={p.code} d={p.d} fill={BASE_FILL} />
              ))}
              {TAG.map((p) => (
                <path
                  key={`fill-${p.code}`}
                  d={p.d}
                  fill={WAVES[p.wave - 1].color}
                  clipPath={`url(#spread-${p.code})`}
                />
              ))}
              {PROVINCES.map((p) => (
                <path
                  key={`edge-${p.code}`}
                  className={p.name ? 'cursor-default' : 'pointer-events-none'}
                  d={p.d}
                  fill="transparent"
                  stroke="#ffffff"
                  strokeOpacity={hover === p.name && p.name ? 0.95 : 0.3}
                  strokeWidth={hover === p.name && p.name ? 1.6 : 0.6}
                  strokeLinejoin="round"
                  onPointerEnter={p.name ? () => setHover(p.name) : undefined}
                  onPointerLeave={p.name ? () => setHover(undefined) : undefined}
                />
              ))}
            </g>
            <path
              className="tr-outline pointer-events-none"
              d={TURKEY_OUTLINE}
              fill="none"
              stroke="#ffffff"
              strokeOpacity={0.85}
              strokeWidth={1.4}
              strokeLinejoin="round"
            />
            {TAG.filter((p) => p !== HUB).map((p) => (
              <path
                key={`arc-${p.code}`}
                className="city-arc pointer-events-none"
                data-code={p.code}
                data-wave={p.wave}
                d={arc(p.x, p.y)}
                fill="none"
                stroke="#ffffff"
                strokeWidth={1.1}
                opacity={0.16}
              />
            ))}
            {hovered && (
              <g transform={`translate(${hovered.x},${hovered.y - 10})`} pointerEvents="none">
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
              y={HUB.y - 14}
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
            Yeşil illerin üzerine gelince il adı görünür. Harita, şirketin duyurduğu hizmet
            şehirlerini gösterir; şehir içindeki kapsama alanını göstermez.
          </p>
        </div>
      </div>
    </div>
  );
}
