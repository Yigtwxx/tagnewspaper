import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { ArticleBody } from '@/components/article/ArticleBody';
import { PageEffects } from '@/components/motion/PageEffects';
import { ThemeTriggers } from '@/components/motion/ThemeTriggers';
import { Colophon } from '@/components/sections/Colophon';
import { TopBar } from '@/components/TopBar';
import { type ArticlePageData, getArticle, getSnapshot } from '@/lib/data';
import { clip } from '@/lib/format';
import { isEmptySnapshot } from '@/lib/schema';
import { ARTICLE_BASE, articlePath, parseArticleSlug } from '@/lib/slug';

/**
 * The page reads `params` outside Suspense on purpose: bots then get a blocking render with real
 * 404s. Navigations into it may wait for the server, so opt out of instant-navigation checks.
 */
export const instant = false;

/**
 * Cache Components rejects an empty generateStaticParams, and CI builds have no database. This
 * param carries no article id, so it prerenders as a 404.
 */
const PLACEHOLDER_SLUG = 'yok';

export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  const snapshot = await getSnapshot();
  const params = snapshot.latest
    .filter((a) => a.display === 'full')
    .map((a) => ({ slug: articlePath(a).slice(ARTICLE_BASE.length) }));
  return params.length > 0 ? params : [{ slug: PLACEHOLDER_SLUG }];
}

async function lookup(slug: string): Promise<ArticlePageData | undefined> {
  const id = parseArticleSlug(slug);
  return id ? getArticle(id) : undefined;
}

export async function generateMetadata({ params }: PageProps<'/haber/[slug]'>): Promise<Metadata> {
  const page = await lookup((await params).slug);
  if (!page) return {};
  const { article } = page;
  const path = articlePath(article);
  const description = clip(article.summary ?? article.title, 160);
  return {
    title: article.title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'article',
      title: article.title,
      description,
      url: path,
      siteName: 'TAGNEWSPAPER',
      locale: 'tr_TR',
      publishedTime: article.published_at,
    },
    twitter: { card: 'summary_large_image', title: article.title, description },
  };
}

/**
 * A known id under a stale or hand-typed slug renders the same page; its canonical link names
 * the real path. No redirect: with partial prerendering the shell streams first, so a redirect
 * would be served as a cached 308 without a Location header. A missing page streams a noindex
 * 404 on its first request and is served as a cached 404 afterwards.
 */
export default async function ArticlePage({ params }: PageProps<'/haber/[slug]'>) {
  const page = await lookup((await params).slug);
  if (!page) notFound();

  const snapshot = await getSnapshot();
  const hasData = !isEmptySnapshot(snapshot);

  return (
    <>
      <TopBar lastRunAt={snapshot.last_run_at} hasData={hasData} alwaysShown />
      <main id="icerik">
        <ArticleBody article={page.article} related={page.related} />
      </main>
      <Colophon lastRunAt={snapshot.last_run_at} hasData={hasData} runningHead="HABER" />
      <ThemeTriggers />
      <PageEffects />
    </>
  );
}
