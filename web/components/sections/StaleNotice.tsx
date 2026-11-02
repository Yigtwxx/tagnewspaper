'use client';

import { formatDate, formatTime } from '@/lib/format';
import { useNow } from '@/lib/hooks';

const STALE_MS = 2 * 60 * 60 * 1000;

/** Shows the last update, and says so plainly when the pipeline has not run for 2+ hours. */
export function StaleNotice({ lastRunAt }: { lastRunAt: string }) {
  const now = useNow();
  const stale = now !== undefined && now - Date.parse(lastRunAt) > STALE_MS;

  return (
    <p>
      Son güncelleme: {formatDate(lastRunAt, { year: false })}, {formatTime(lastRunAt)}
      {stale && (
        <span className="ml-2 text-white">(Güncelleme gecikti; haberler eski olabilir.)</span>
      )}
    </p>
  );
}
