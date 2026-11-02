import type { Metadata } from 'next';
import Link from 'next/link';

import { LogoMark, Wordmark } from '@/components/Logo';

export const metadata: Metadata = {
  title: 'Sayfa bulunamadı',
  robots: { index: false },
};

export default function NotFound() {
  return (
    <main
      id="icerik"
      data-theme="ink"
      className="flex min-h-[100svh] flex-col items-center justify-center gap-8 px-4 py-16 text-center sm:px-8"
    >
      <Link href="/" className="flex items-center gap-3" aria-label="The TAG Newspaper, ön sayfa">
        <LogoMark className="size-12" />
        <Wordmark className="text-[2rem]" />
      </Link>
      <div className="w-full max-w-xl border-t-[3px] border-white pt-[3px]">
        <div className="border-t border-white/70" />
      </div>
      <p className="font-sans text-[11px] tracking-[0.2em] text-white/60">HATA 404</p>
      <h1 className="headline max-w-xl text-[clamp(2rem,5vw,3.25rem)]">
        Aradığınız sayfa bu baskıda yok.
      </h1>
      <p className="dek mx-auto">
        Bağlantı eski ya da yanlış yazılmış olabilir. Güncel haberler ön sayfada.
      </p>
      <Link
        href="/"
        className="border border-white px-6 py-3 font-sans text-sm font-semibold transition-colors hover:bg-white hover:text-black"
      >
        Ön sayfaya dön
      </Link>
    </main>
  );
}
