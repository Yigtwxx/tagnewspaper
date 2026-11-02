import { SplitFlapMasthead } from './SplitFlapMasthead';

/** Nameplate band. The front page itself starts right below, in newspaper style. */
export function Hero() {
  return (
    <section
      data-section="hero"
      data-theme="ink"
      className="flex min-h-[46svh] flex-col items-center justify-center gap-7 px-4 pt-14 pb-12 sm:px-8"
    >
      <h1 className="sr-only">TAGNEWSPAPER: Martı TAG haberleri, dava takibi ve veriler</h1>
      <SplitFlapMasthead />
      <p className="max-w-xl text-center font-serif text-[clamp(1rem,1.6vw,1.25rem)] text-white/85 italic">
        Martı TAG hakkında çıkan haberler, mahkeme kararları ve açıklanan rakamlar. Hepsi
        kaynağıyla.
      </p>
    </section>
  );
}
