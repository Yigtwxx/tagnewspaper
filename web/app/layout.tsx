import type { Metadata, Viewport } from 'next';
import { Archivo, Newsreader } from 'next/font/google';

import { SmoothScroll } from '@/components/motion/SmoothScroll';
import { siteUrl } from '@/lib/site';

import './globals.css';

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin', 'latin-ext'],
  axes: ['opsz'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin', 'latin-ext'],
  axes: ['wdth'],
  display: 'swap',
});

const description =
  'Martı TAG hakkında çıkan haberler, dava süreci ve kullanıcı rakamları tek sayfada. Bağımsız, reklamsız, kaynak gösteren bir bilgi gazetesi.';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: 'TAGNEWSPAPER: Martı TAG haberleri ve dava takibi',
    template: '%s | TAGNEWSPAPER',
  },
  description,
  applicationName: 'TAGNEWSPAPER',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'tr_TR',
    siteName: 'TAGNEWSPAPER',
    title: 'TAGNEWSPAPER',
    description,
    url: '/',
  },
  twitter: { card: 'summary_large_image', title: 'TAGNEWSPAPER', description },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  colorScheme: 'dark light',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="tr" className={`${newsreader.variable} ${archivo.variable} antialiased`}>
      <body>
        <a
          href="#haberler"
          className="sr-only z-[100] bg-tag px-4 py-2 font-sans text-black focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Haberlere geç
        </a>
        <SmoothScroll />
        {children}
      </body>
    </html>
  );
}
