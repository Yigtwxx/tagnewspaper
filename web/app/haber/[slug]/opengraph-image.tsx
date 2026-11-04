import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { notFound } from 'next/navigation';
import { ImageResponse } from 'next/og';

import { getArticle } from '@/lib/data';
import { formatDate, trUpper } from '@/lib/format';
import { CATEGORY_LABEL } from '@/lib/labels';
import { LOGO_DOT_X, LOGO_T_PATH } from '@/lib/logo';
import { parseArticleSlug } from '@/lib/slug';

export const alt = 'TAGNEWSPAPER haber kartı';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const TAG_GREEN = '#01b251';

/** Long headlines get a smaller size so they never run past the card. */
function headlineSize(title: string): number {
  if (title.length <= 60) return 64;
  if (title.length <= 100) return 52;
  return 42;
}

/** Social card for one article: its headline on the site's black front page. */
export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const id = parseArticleSlug((await params).slug);
  const page = id ? await getArticle(id) : undefined;
  if (!page) notFound();
  const { article } = page;

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
        padding: '52px 72px',
        fontFamily: 'Franklin',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <path d={LOGO_T_PATH} fill="#ffffff" />
          <circle cx={LOGO_DOT_X} cy={50} r={5} fill={TAG_GREEN} />
        </svg>
        <div style={{ display: 'flex', fontFamily: 'Gothic', fontSize: 48 }}>
          The&nbsp;<span style={{ color: TAG_GREEN }}>TAG</span>&nbsp;Newspaper
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', marginTop: 22 }}>
        <div style={{ height: 4, background: '#ffffff' }} />
        <div style={{ height: 1.5, background: '#ffffff', marginTop: 4 }} />
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 36,
          fontSize: 26,
          letterSpacing: 1,
          color: TAG_GREEN,
        }}
      >
        {trUpper(CATEGORY_LABEL[article.category])}
        {article.is_allegation ? '   ·   İDDİA' : ''}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 18,
          fontFamily: 'Caslon',
          fontSize: headlineSize(article.title),
          lineHeight: 1.12,
          maxWidth: 1056,
        }}
      >
        {article.title}
      </div>

      <div
        style={{
          display: 'flex',
          marginTop: 'auto',
          justifyContent: 'space-between',
          fontSize: 26,
          color: '#9a9a9a',
        }}
      >
        <span>
          {article.source.name}, {formatDate(article.published_at)}
        </span>
        <span>tagnewspaper.vercel.app</span>
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
