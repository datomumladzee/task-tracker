// The logo: a navy square with a lime check, then the Sora wordmark. Used on
// the sign-in card, the sidebar and the phone top bar, all navy. The faint
// white border keeps the square visible on navy, which is nearly the same
// colour.
//
// markOnly: just the square, for the collapsed sidebar rail.
// size="lg": the sidebar's slightly larger version (40px square).

import { Wordmark } from "./Wordmark";

export function Logo({ markOnly = false, size = "md" }: { markOnly?: boolean; size?: "md" | "lg" }) {
  const lg = size === "lg";
  return (
    <span className={`inline-flex items-center ${lg ? "gap-2.5" : "gap-2"}`}>
      <span
        className={`flex shrink-0 items-center justify-center border border-white/15 bg-navy ${lg ? "h-10 w-10 rounded-lg" : "h-8 w-8 rounded-md"}`}
      >
        <svg viewBox="0 0 16 16" className={lg ? "h-5 w-5" : "h-4 w-4"} aria-hidden="true">
          <path d="M3 8.5l3 3 7-7" fill="none" stroke="var(--color-lime)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!markOnly && <Wordmark size={size} />}
    </span>
  );
}
