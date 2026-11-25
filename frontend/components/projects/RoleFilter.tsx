// The pill-shaped filter under the Projects title: All, Admin, Standard,
// Viewer, each with its count. It filters the project cards by your role on
// them. A role you have on no project is left out. The selected option is a
// lime fill with navy text (12.6:1), the others muted.
//
// Toggle buttons with aria-pressed, in a labelled group: the simplest pattern
// every screen reader knows. On phones the row scrolls sideways instead of
// wrapping.

import type { ProjectRole } from "@/lib/types";

export type RoleFilterValue = "all" | ProjectRole;

const OPTIONS: { value: RoleFilterValue; label: string }[] = [
  { value: "all", label: "All" },
  { value: "admin", label: "Admin" },
  { value: "standard", label: "Standard" },
  { value: "viewer", label: "Viewer" },
];

type Props = {
  counts: Record<RoleFilterValue, number>;
  value: RoleFilterValue;
  onChange: (value: RoleFilterValue) => void;
};

export function RoleFilter({ counts, value, onChange }: Props) {
  return (
    // The outer div scrolls; the pill inside keeps its shape.
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <div role="group" aria-label="Filter projects by your role" className="inline-flex gap-1 rounded-full border border-line bg-card p-1 shadow-sm">
        {OPTIONS.filter((o) => o.value === "all" || counts[o.value] > 0).map((o) => {
          const selected = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(o.value)}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm whitespace-nowrap ${
                selected ? "bg-lime font-semibold text-navy" : "font-medium text-muted hover:bg-page hover:text-ink"
              }`}
            >
              {o.label}
              <span className={`text-xs ${selected ? "text-navy" : "text-muted"}`}>{counts[o.value]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
