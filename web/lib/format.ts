/** Turkish formatting helpers. Server runs in UTC, so every absolute time pins Europe/Istanbul. */

export const TZ = 'Europe/Istanbul';
const LOCALE = 'tr-TR';

export function trUpper(text: string): string {
  return text.toLocaleUpperCase(LOCALE);
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

/** Issue number counted in days since launch (2 Nov 2026 = issue 1). */
export const LAUNCH_DATE_UTC = Date.UTC(2026, 10, 2);

export function issueNumber(iso: string): number {
  const days = Math.floor((new Date(iso).getTime() - LAUNCH_DATE_UTC) / 86_400_000);
  return Math.max(1, days + 1);
}

/** Pad or cut text to exactly `width` characters for split-flap rows. */
export function fitCells(text: string, width: number): string {
  const clean = trUpper(text).replace(/\s+/g, ' ').trim();
  return clean.length >= width ? clean.slice(0, width) : clean.padEnd(width, ' ');
}
