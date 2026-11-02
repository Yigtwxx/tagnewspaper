import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { LOGO_DOT_X, LOGO_T_PATH } from '@/lib/logo';

export const alt = 'The TAG Newspaper: Martı TAG için bağımsız haber, dava takibi ve veri gazetesi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TAG_GREEN = '#01b251';

const OFFERS = [
  'Her gün 11.00’de yeni sayı: kaynaklı, tarafsız haber özetleri',
  'Davanın 2023’ten bugüne zaman çizelgesi',
  '40 şehir, kullanıcı rakamları ve medya verileri',
];

/** Social card: says what the site is, not what today's headline is. */
export default async function Image() {
  const [caslon, franklin, gothic] = await Promise.all([
    readFile(join(process.cwd(), 'assets/fonts/LibreCaslonText-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/LibreFranklin-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/UnifrakturMaguntia-Book.ttf')),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#000000',
        color: '#ffffff',
        padding: '56px 72px',
        fontFamily: 'Franklin',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
        <svg width="112" height="112" viewBox="0 0 64 64">
          <path d={LOGO_T_PATH} fill="#ffffff" />
          <circle cx={LOGO_DOT_X} cy={50} r={5} fill={TAG_GREEN} />
        </svg>
        <div style={{ display: 'flex', fontFamily: 'Gothic', fontSize: 84 }}>
          The&nbsp;<span style={{ color: TAG_GREEN }}>TAG</span>&nbsp;Newspaper
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 26 }}>
        <div style={{ height: 4, background: '#ffffff' }} />
        <div style={{ height: 1.5, background: '#ffffff', marginTop: 4 }} />
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 34,
          fontFamily: 'Caslon',
          fontSize: 50,
          lineHeight: 1.15,
          maxWidth: 1000,
        }}
      >
        Martı TAG için bağımsız haber, dava takibi ve veri gazetesi.
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 30 }}>
        {OFFERS.map((line) => (
          <div key={line} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 28 }}>
            <div style={{ width: 12, height: 12, borderRadius: 6, background: TAG_GREEN }} />
            <span style={{ color: '#e6e6e6' }}>{line}</span>
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          justifyContent: 'space-between',
          fontSize: 24,
          color: '#9a9a9a',
        }}
      >
        <span>tagnewspaper.vercel.app</span>
        <span>Bağımsız, reklamsız ve açık kaynak</span>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Caslon', data: caslon, style: 'normal', weight: 700 },
        { name: 'Franklin', data: franklin, style: 'normal', weight: 600 },
        { name: 'Gothic', data: gothic, style: 'normal', weight: 400 },
      ],
    },
  );
}
