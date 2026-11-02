import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { getSnapshot } from '@/lib/data';
import { editionStart, formatDate, formatNumber } from '@/lib/format';
import { LOGO_DOT_X, LOGO_T_PATH } from '@/lib/logo';

export const alt = 'The TAG Newspaper: Martı TAG haberleri, dava takibi ve veriler';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TAG_GREEN = '#01b251';
const TAG_INK = '#007a37';

/**
 * Social card: today's lead headline set like a newspaper front page. It is rebuilt
 * whenever the pipeline revalidates the `news` tag, so shared links always show the
 * current lead.
 */
export default async function Image() {
  const [snapshot, caslon, franklin, gothic] = await Promise.all([
    getSnapshot(),
    readFile(join(process.cwd(), 'assets/fonts/LibreCaslonText-Bold.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/LibreFranklin-SemiBold.ttf')),
    readFile(join(process.cwd(), 'assets/fonts/UnifrakturMaguntia-Book.ttf')),
  ]);

  const lead = snapshot.lead?.article ?? snapshot.latest[0];
  const headline = lead?.title ?? 'Martı TAG hakkında çıkan haberler, dava süreci ve rakamlar';
  const source = lead ? `${lead.source.name}` : 'Bağımsız ve reklamsız';
  const drivers = snapshot.stats.find((s) => s.key === 'drivers');
  const edition = snapshot.latest.length
    ? `${formatDate(editionStart(snapshot.generated_at), { weekday: true })}`
    : 'İlk sayı hazırlanıyor';
  const headlineSize = headline.length > 90 ? 58 : headline.length > 60 ? 66 : 76;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        color: '#000000',
        padding: '48px 64px',
        fontFamily: 'Franklin',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <svg width="64" height="64" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="12" fill="#000000" />
            <path d={LOGO_T_PATH} fill="#ffffff" />
            <circle cx={LOGO_DOT_X} cy={50} r={5} fill={TAG_GREEN} />
          </svg>
          <div style={{ display: 'flex', fontFamily: 'Gothic', fontSize: 46 }}>
            The&nbsp;<span style={{ color: TAG_INK }}>TAG</span>&nbsp;Newspaper
          </div>
        </div>
        <div style={{ display: 'flex', fontSize: 24, color: '#5c5c5c' }}>{edition}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
        <div style={{ height: 5, background: '#000000' }} />
        <div style={{ height: 2, background: '#000000', marginTop: 4 }} />
      </div>

      <div
        style={{
          display: 'flex',
          flex: 1,
          alignItems: 'center',
          fontFamily: 'Caslon',
          fontSize: headlineSize,
          lineHeight: 1.12,
          letterSpacing: -0.5,
        }}
      >
        {headline}
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '2px solid #000000',
          paddingTop: 18,
          fontSize: 26,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: 7, background: TAG_GREEN }} />
          <span>{source}</span>
        </div>
        <div style={{ display: 'flex', color: TAG_INK }}>
          40 şehir
          {drivers ? ` · ${formatNumber(drivers.value)} sürücü` : ''}
        </div>
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
