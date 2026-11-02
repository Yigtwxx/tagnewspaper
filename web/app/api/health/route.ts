import { getSnapshot } from '@/lib/data';
import { isEmptySnapshot } from '@/lib/schema';

/**
 * Public, read-only freshness report for the health-check workflow. Exposes only what the
 * page already shows: when the pipeline last ran and whether recent stories got summaries.
 */
export async function GET(): Promise<Response> {
  const snapshot = await getSnapshot();
  return Response.json(
    {
      has_data: !isEmptySnapshot(snapshot),
      last_run_at: snapshot.last_run_at,
      generated_at: snapshot.generated_at,
      recent: snapshot.latest.map((a) => ({ published_at: a.published_at, display: a.display })),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
