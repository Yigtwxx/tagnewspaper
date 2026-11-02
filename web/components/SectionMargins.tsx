export type MarginTheme = 'ink' | 'paper' | 'tag';

/** Text color for margin type on each section background (green sections take white). */
const COLOR: Record<MarginTheme, string> = {
  ink: '#ffffff',
  paper: '#000000',
  tag: '#ffffff',
};

/**
 * Page margins on wide screens (1520px and up; narrower, they would overlap the content).
 * Every section carries its own fixed copy of the margin type, and every section clips its
 * contents (`.margin-clip`), so a copy is only
 * visible inside its own section. Where two sections meet, the type splits exactly on the
 * boundary, half in one color and half in the other, and the change travels with the scroll.
 * Left: the section's number and name, set vertically. Right: the running head.
 */
export function SectionMargins({
  index,
  label,
  theme,
  runningHead,
}: {
  index: number;
  label: string;
  theme: MarginTheme;
  runningHead: string;
}) {
  const color = COLOR[theme];
  return (
    <div aria-hidden="true" className="hidden min-[1520px]:block">
      <div
        className="pointer-events-none fixed top-1/2 left-5 z-30 -translate-y-1/2"
        style={{ color }}
      >
        <p className="flex rotate-180 items-center gap-3 whitespace-nowrap [writing-mode:vertical-rl]">
          <span className="font-sans text-[11px] tracking-[0.2em] tabular-nums opacity-60">
            {String(index).padStart(2, '0')}
          </span>
          <span className="h-8 w-px bg-current opacity-40" />
          <span className="font-serif text-[26px] leading-none font-bold">{label}</span>
        </p>
      </div>
      <div
        className="pointer-events-none fixed top-1/2 right-5 z-30 -translate-y-1/2"
        style={{ color }}
      >
        <p className="flex rotate-180 items-center gap-4 font-sans text-[11px] tracking-[0.18em] whitespace-nowrap opacity-70 [writing-mode:vertical-rl]">
          <span className="font-blackletter text-[17px] tracking-normal">The TAG Newspaper</span>
          <span className="h-12 w-px bg-current opacity-50" />
          <span>{runningHead}</span>
        </p>
      </div>
    </div>
  );
}
