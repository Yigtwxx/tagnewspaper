import Link from 'next/link';
import type { ReactNode } from 'react';

import type { ArticleViewT } from '@/lib/schema';
import { articleHref } from '@/lib/slug';

/**
 * Link to an article: its own page when it has a summary, otherwise the publisher in a new tab.
 * Prefetch is off so a visit to the front page does not render every article page.
 */
export function ArticleLink({
  article,
  className,
  tabIndex,
  children,
}: {
  article: ArticleViewT;
  className?: string;
  tabIndex?: number;
  children: ReactNode;
}) {
  const { href, external } = articleHref(article);
  if (external) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
        tabIndex={tabIndex}
      >
        {children}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={false} className={className} tabIndex={tabIndex}>
      {children}
    </Link>
  );
}
