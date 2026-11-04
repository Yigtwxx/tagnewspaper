/** Turkish formatting helpers. Server runs in UTC, so every absolute time pins Europe/Istanbul. */

export const TZ = 'Europe/Istanbul';
const LOCALE = 'tr-TR';

export function trUpper(text: string): string {
  return text.toLocaleUpperCase(LOCALE);
}

/** At most `max` characters, cut at a word boundary and ending with an ellipsis. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const cut = head.lastIndexOf(' ');
  return `${(cut > 0 ? head.slice(0, cut) : head).trimEnd()}…`;
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TZ,
  }).format(new Date(iso));
}

export function formatDate(iso: string, opts?: { weekday?: boolean; year?: boolean }): string {
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: opts?.year === false ? undefined : 'numeric',
    weekday: opts?.weekday ? 'long' : undefined,
    timeZone: TZ,
  }).format(new Date(iso));
}

/** Calendar dates (YYYY-MM-DD) are already Istanbul-local; format them without shifting. */
export function formatCalendarDate(
  ymd: string,
  opts?: { year?: boolean; short?: boolean },
): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: opts?.short ? 'short' : 'long',
    year: opts?.year === false ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(LOCALE).format(value);
}

/** 4900000 → "4,9 milyon", 584000 → "584 bin". */
export function formatCompact(value: number): { value: string; unit: string } {
  if (value >= 1_000_000) {
    const v = value / 1_000_000;
    return {
      value: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 }).format(v),
      unit: 'milyon',
    };
  }
  if (value >= 1_000) {
    const v = value / 1_000;
    return {
      value: new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 }).format(v),
      unit: 'bin',
    };
  }
  return { value: formatNumber(value), unit: '' };
}

export function relativeTime(iso: string, now: number): string {
  const diffSec = Math.round((new Date(iso).getTime() - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  const abs = Math.abs(diffSec);
  if (abs < 60) return 'az önce';
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  return formatDate(iso);
}

/**
 * Daily edition. A new issue goes out every day at 11:00 Istanbul time (08:00 UTC; Turkey
 * has no daylight saving). Issue 1 is the edition of 2 Nov 2026, 11:00.
 */
export const EDITION_HOUR_UTC = 8;
export const LAUNCH_EDITION_UTC = Date.UTC(2026, 10, 2, EDITION_HOUR_UTC);
const DAY_MS = 86_400_000;

export function issueNumber(iso: string): number {
  const elapsed = new Date(iso).getTime() - LAUNCH_EDITION_UTC;
  return Math.max(1, Math.floor(elapsed / DAY_MS) + 1);
}

/** Start of the edition that `iso` belongs to (the latest 11:00 Istanbul at or before it). */
export function editionStart(iso: string): string {
  const t = new Date(iso).getTime();
  const start =
    LAUNCH_EDITION_UTC + Math.max(0, Math.floor((t - LAUNCH_EDITION_UTC) / DAY_MS)) * DAY_MS;
  return new Date(start).toISOString();
}

/** Ablative suffix for each month name, by month index ("Ekim'den", "Ağustos'tan"). */
const FROM_SUFFIX = [
  "'tan",
  "'tan",
  "'tan",
  "'dan",
  "'tan",
  "'dan",
  "'dan",
  "'tan",
  "'den",
  "'den",
  "'dan",
  "'tan",
] as const;

/**
 * How to name the period a set of daily counts covers. Collection started after the 90-day
 * window opened, so until it fills, totals are labelled from the first day with news.
 */
export function coverageSince(daily: { date: string; count: number }[]): {
  label: string;
  since: string;
} {
  const first = daily.findIndex((d) => d.count > 0);
  if (first <= 0) return { label: 'Son 90 günde', since: daily[0]?.date ?? '' };
  const since = daily[first].date;
  const month = Number(since.slice(5, 7)) - 1;
  const day = formatCalendarDate(since, { year: false });
  return { label: `${day}${FROM_SUFFIX[month]} bu yana`, since };
}
