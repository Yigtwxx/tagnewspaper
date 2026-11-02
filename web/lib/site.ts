/** Public site configuration. Only NEXT_PUBLIC_* values may reach the client bundle. */

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}

export const REPO_URL = 'https://github.com/Yigtwxx/tagnewspaper';

export function contactEmail(): string | undefined {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL || undefined;
}

/** Publisher identification shown in the colophon (Law 5651 art. 3). Configured via env. */
export function publisherName(): string | undefined {
  return process.env.NEXT_PUBLIC_PUBLISHER_NAME || undefined;
}
