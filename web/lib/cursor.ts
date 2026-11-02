/** Keyset cursor: "<published_at ISO>|<id>". Opaque to clients, validated on the way in. */

export interface CursorPosition {
  publishedAt: string;
  id: string;
}

const ID_RE = /^[0-9a-f]{16}$/;

export function encodeCursor(publishedAt: string, id: string): string {
  return `${publishedAt}|${id}`;
}

export function decodeCursor(raw: string): CursorPosition | undefined {
  const sep = raw.lastIndexOf('|');
  if (sep <= 0) return undefined;
  const publishedAt = raw.slice(0, sep);
  const id = raw.slice(sep + 1);
  if (!ID_RE.test(id) || Number.isNaN(Date.parse(publishedAt))) return undefined;
  return { publishedAt: new Date(publishedAt).toISOString(), id };
}
