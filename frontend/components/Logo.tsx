// The logo: a navy square with a lime check, then the Sora wordmark. Used on
// the sign-in card and in the app header, both navy. The faint white border
// keeps the square visible on navy, which is nearly the same colour.

import { Wordmark } from "./Wordmark";

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-white/15 bg-navy">
        <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="var(--color-lime)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <Wordmark />
    </span>
  );
}
