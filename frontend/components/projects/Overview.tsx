// The strip above the project cards: open tasks across every project, how
// many are overdue, and how many are yours. Built from the tasks the cards
// already load, so it costs no request.
//
// Numbers show once every project has answered, with placeholders until
// then, so a total never counts up in front of the user. Projects whose
// tasks failed to load are left out of the totals, as on My tasks.

import Link from "next/link";
import type { ProjectStats } from "@/lib/projectStats";

type Props = {
  stats: ProjectStats[];
  settled: boolean;
};

export function Overview({ stats, settled }: Props) {
  const open = stats.reduce((n, s) => n + s.open, 0);
  const overdue = stats.reduce((n, s) => n + s.overdue, 0);
  const mine = stats.reduce((n, s) => n + s.mine, 0);

  const tile = "rounded-xl border border-line bg-card px-4 py-3 shadow-sm";
  const number = (value: number, red = false) =>
    settled ? (
      <p className={`font-brand text-2xl font-semibold sm:text-3xl ${red ? "text-danger" : "text-ink"}`}>{value}</p>
    ) : (
      <div className="my-1.5 h-6 w-10 rounded bg-line motion-safe:animate-pulse sm:h-7" aria-hidden="true" />
    );

  return (
    <section aria-label="Overview" className="grid grid-cols-3 gap-3 sm:gap-4">
      <div className={tile}>
        <p className="text-xs font-medium text-muted sm:text-sm">Open tasks</p>
        {number(open)}
      </div>
      <div className={tile}>
        <p className="text-xs font-medium text-muted sm:text-sm">Overdue</p>
        {number(overdue, overdue > 0)}
      </div>
      {/* A link: the full list of these lives on My tasks. */}
      <Link href="/my-tasks" className={`${tile} group transition-colors hover:border-navy`}>
        <p className="text-xs font-medium text-muted sm:text-sm">
          Assigned to you <span aria-hidden="true" className="text-navy">→</span>
        </p>
        {number(mine)}
        <span className="sr-only">, see My tasks</span>
      </Link>
    </section>
  );
}
