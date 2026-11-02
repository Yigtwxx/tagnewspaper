const RIM_TEXT = "THE TAG NEWSPAPER • HER GÜN 11.00'DE YENİ SAYI • BAĞIMSIZ YAYIN • ";
/** Radius of the circle the rim lettering sits on, in viewBox units (0..160). */
const RIM_R = 64;

/**
 * The right-hand ear: a round edition stamp. Lettering runs around the rim; the issue
 * number sits in the middle. The rim settles into place on load and turns a little on hover.
 */
export function EditionSeal({ issue, date }: { issue: number; date: string }) {
  const rim = `M 80,80 m -${RIM_R},0 a ${RIM_R},${RIM_R} 0 1,1 ${RIM_R * 2},0 a ${RIM_R},${RIM_R} 0 1,1 -${RIM_R * 2},0`;
  const words = RIM_TEXT.split('•');
  return (
    <div className="seal relative size-[9.5rem]">
      <svg viewBox="0 0 160 160" className="absolute inset-0 size-full" aria-hidden="true">
        <defs>
          <path id="seal-rim" d={rim} />
        </defs>
        <circle cx="80" cy="80" r="77" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle
          cx="80"
          cy="80"
          r="74"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="0.6"
        />
        <circle
          cx="80"
          cy="80"
          r="56"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.45"
          strokeWidth="0.6"
        />
        <g className="seal-rim">
          <text className="font-sans" fontSize="8.4" fontWeight="600" fill="currentColor">
            <textPath href="#seal-rim" textLength={2 * Math.PI * RIM_R - 2} lengthAdjust="spacing">
              {words.map((w, i) => (
                <tspan key={i}>
                  {w}
                  {i < words.length - 1 && <tspan fill="var(--color-tag)">●</tspan>}
                </tspan>
              ))}
            </textPath>
          </text>
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-sans text-[10px] font-semibold tracking-[0.18em] text-white/70">
          SAYI
        </span>
        <span className="font-serif text-[2.6rem] leading-[1.05] font-bold tabular-nums">
          {issue}
        </span>
        <span className="font-serif text-[0.8rem] text-white/80 italic">{date}</span>
      </div>
    </div>
  );
}
