// "The AI wasn't sure": a summary above the draft of what still needs an
// answer. The questions themselves sit next to their fields below it, so the
// fix happens in place; this only says where to look.

import type { Outcome } from "@/lib/types";

type Props = {
  // Outcomes still open after the user's answers so far.
  project: Outcome | null;
  assignee: Outcome | null;
};

const why: Partial<Record<Outcome, string>> = {
  ambiguous: "matches more than one",
  unknown: "matches nothing",
  waiting: "can be checked once the project is chosen",
};

export function UnsureBanner({ project, assignee }: Props) {
  const items = [
    project && why[project] ? `the project (${why[project]})` : null,
    assignee && why[assignee] ? `the assignee (${why[assignee]})` : null,
  ].filter(Boolean);
  if (items.length === 0) return null;

  return (
    <div role="status" className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <p className="font-medium">The AI wasn&apos;t sure about {items.join(" and ")}.</p>
      <p>Pick an answer below to continue.</p>
    </div>
  );
}
