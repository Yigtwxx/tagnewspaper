'use client';

import { EDITION_HOUR_UTC } from '@/lib/format';
import { useNow } from '@/lib/hooks';

const DAY_MS = 86_400_000;

/** Time left until the next 11:00 (Istanbul) edition, refreshed every minute. */
export function EditionCountdown() {
  const now = useNow();
  if (now === undefined) return <span>Her gün 11.00&apos;de yeni sayı</span>;
  const today = new Date(now);
  let next = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
    EDITION_HOUR_UTC,
  );
  if (next <= now) next += DAY_MS;
  const minutes = Math.ceil((next - now) / 60_000);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return (
    <span>
      Sonraki sayıya {h > 0 ? `${h} sa ` : ''}
      {m} dk
    </span>
  );
}
