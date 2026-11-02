import type { NextRequest } from 'next/server';
import { z } from 'zod';

import { getNewsPage, MAX_PAGE } from '@/lib/data';
import { Category } from '@/lib/schema';

const Query = z.object({
  cursor: z.string().max(80).optional(),
  category: Category.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE).default(12),
});

export async function GET(request: NextRequest): Promise<Response> {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = Query.safeParse(params);
  if (!parsed.success) {
    return Response.json({ error: 'invalid_query' }, { status: 400 });
  }
  const { cursor, category, limit } = parsed.data;
  const page = await getNewsPage(cursor, category, limit);
  return Response.json(page, {
    headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=600' },
  });
}
