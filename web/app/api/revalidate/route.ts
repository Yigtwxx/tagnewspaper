import { createHash, timingSafeEqual } from 'node:crypto';

import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

import { NEWS_TAG } from '@/lib/data';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison on fixed-length digests, so length never leaks. */
function secretMatches(provided: string, expected: string): boolean {
  return timingSafeEqual(digest(provided), digest(expected));
}

export async function POST(request: NextRequest): Promise<Response> {
  const expected = process.env.REVALIDATE_SECRET;
  if (!expected || expected.length < 32) {
    return Response.json({ ok: false, error: 'not_configured' }, { status: 503 });
  }
  const provided = request.headers.get('x-revalidate-secret') ?? '';
  if (!secretMatches(provided, expected)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  revalidateTag(NEWS_TAG, 'max');
  return Response.json({ ok: true, revalidated: NEWS_TAG });
}
