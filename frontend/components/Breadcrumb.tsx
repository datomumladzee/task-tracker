// The breadcrumb at the top of project pages, shared so every page draws it
// the same way:
//
//   Projects  ›  Website relaunch  ›  Members  [admin]
//   └ links, muted, soft pill on hover ┘   └ heading, Sora ┘ └ badge ┘
//
// The trail of links sits in a labelled <nav>; the current page is the
// page's <h1>, so screen readers hear "Breadcrumb" with its links, then the
// heading. The chevrons are decoration and hidden from them. The badge (the
// caller's role) sits right after the heading on the same centre line.

import Link from "next/link";

type Props = {
  // The pages above this one, outermost first.
  trail: { label: string; href: string }[];
  // This page, shown as its heading.
  current: string;
  // Shown right after the heading, e.g. the role badge.
  badge?: React.ReactNode;
};

function Chevron() {
  return (
    <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0 text-muted/70" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3.5l4.5 4.5L6 12.5" />
    </svg>
  );
}

export function Breadcrumb({ trail, current, badge }: Props) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
      <nav aria-label="Breadcrumb" className="flex min-w-0 flex-wrap items-center gap-1">
        {trail.map(({ label, href }, i) => (
          <span key={href} className="flex min-w-0 items-center gap-1">
            {/* -ml-2 on the first link lines its text up with the page edge
                while its hover pill still has room. */}
            <Link
              href={href}
              className={`truncate rounded-md px-2 py-1 text-sm font-medium text-muted transition-colors hover:bg-line/60 hover:text-navy ${i === 0 ? "-ml-2" : ""}`}
            >
              {label}
            </Link>
            <Chevron />
          </span>
        ))}
      </nav>
      <h1 className="ml-1 min-w-0 font-brand text-xl font-semibold text-ink">{current}</h1>
      {badge && <span className="ml-2 flex items-center">{badge}</span>}
    </div>
  );
}
