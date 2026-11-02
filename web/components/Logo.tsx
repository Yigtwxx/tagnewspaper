import { LOGO_DOT_X, LOGO_T_PATH } from '@/lib/logo';

/** Blackletter "T" with the TAG-green dot. Takes the surrounding text color. */
export function LogoMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <path d={LOGO_T_PATH} fill="currentColor" />
      <circle cx={LOGO_DOT_X} cy={50} r={5} fill="#01b251" />
    </svg>
  );
}

/** "The TAG Newspaper" in blackletter, with TAG in green. */
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`font-blackletter leading-none whitespace-nowrap ${className}`}>
      The <span className="text-(--accent-text)">TAG</span> Newspaper
    </span>
  );
}
