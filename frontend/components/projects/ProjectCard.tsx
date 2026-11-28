// One project on the Projects page. The whole card links to the board.
//
// The top half comes from the projects list and shows at once. The task
// line at the bottom (bar and counts) comes from one tasks request per
// project and fills in when it returns: undefined while loading, "error" if
// it failed, in which case the card simply goes without it.

import Link from "next/link";
import { RoleBadge } from "../RoleBadge";
import { LetterTile, tileShade } from "./LetterTile";
import { dueLabel, timeAgo, todayIso, type ProjectStats } from "@/lib/projectStats";
import { STATUSES, type Project } from "@/lib/types";

type Props = {
  project: Project;
  stats: ProjectStats | "error" | undefined;
  currentUserId: number | undefined;
};

export function ProjectCard({ project, stats, currentUserId }: Props) {
  const byYou = currentUserId !== undefined && project.created_by_id === currentUserId;
  return (
    <Link
      href={`/projects/${project.id}`}
      // Hover: navy border, a deeper shadow and, for people who allow
      // motion, a 2px lift. Tailwind v4 lifts with the CSS translate
      // property, not transform, so that is what the transition names.
      // overflow-hidden keeps the accent strip inside the rounded corners.
      className="relative flex h-full flex-col gap-4 overflow-hidden rounded-xl border border-line bg-card p-5 pt-6 shadow-sm transition-[translate,box-shadow,border-color] duration-150 hover:border-navy hover:shadow-md motion-safe:hover:-translate-y-0.5"
    >
      {/* A thin strip in the project's own shade, matching its tile, so a
          project is easy to pick out at a glance. Decoration only. */}
      <span aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${tileShade(project.id)}`} />
      <div className="flex items-start gap-3">
        <LetterTile id={project.id} name={project.name} />
        <div className="min-w-0 flex-1">
          <h2 title={project.name} className="truncate font-brand font-semibold text-ink">
            {project.name}
          </h2>
          {project.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{project.description}</p>}
        </div>
        <RoleBadge role={project.role} />
      </div>

      {/* mt-auto pushes the task line and footer to the bottom, so cards
          in one row line up even when only some have a description. */}
      <div className="mt-auto space-y-3">
        <TaskLine stats={stats} />
        <p className="text-xs text-muted">
          Created {timeAgo(project.created_at)}
          {byYou && " · by you"}
        </p>
      </div>
    </Link>
  );
}

const segmentColour = {
  todo: "bg-status-todo",
  in_progress: "bg-status-in-progress",
  in_review: "bg-status-in-review",
  done: "bg-status-done",
};

function TaskLine({ stats }: { stats: ProjectStats | "error" | undefined }) {
  if (stats === "error") return null;

  if (stats === undefined) {
    // A grey placeholder the size of the real thing, so nothing jumps when
    // the numbers arrive. Pulses only if the user allows motion.
    return (
      <div className="space-y-2" aria-hidden="true">
        <div className="h-1.5 rounded-full bg-line motion-safe:animate-pulse" />
        <div className="h-3 w-32 rounded bg-line motion-safe:animate-pulse" />
      </div>
    );
  }

  if (stats.total === 0) {
    return (
      <div className="space-y-2">
        <div className="h-1.5 rounded-full bg-page" />
        <p className="text-sm text-muted">No tasks yet</p>
      </div>
    );
  }

  // Said in words for screen readers; the bar itself is decoration.
  const described = STATUSES.map((s) => `${stats.byStatus[s.value]} ${s.label.toLowerCase()}`).join(", ");

  return (
    <div className="space-y-2">
      <div role="img" aria-label={`Tasks: ${described}`} title={described} className="flex h-1.5 overflow-hidden rounded-full bg-page">
        {STATUSES.map((s) =>
          stats.byStatus[s.value] > 0 ? (
            <span key={s.value} className={segmentColour[s.value]} style={{ width: `${(stats.byStatus[s.value] / stats.total) * 100}%` }} />
          ) : null,
        )}
      </div>
      <p className="text-sm text-muted">
        {stats.open === 0 ? "All done" : `${stats.open} open`}
        {stats.overdue > 0 && (
          <>
            {" · "}
            <span className="font-medium text-danger">{stats.overdue} overdue</span>
          </>
        )}
        {stats.mine > 0 && ` · ${stats.mine} assigned to you`}
      </p>
      {stats.next && <NextLine next={stats.next} />}
    </div>
  );
}

// "Next: Write the auth docs · Tomorrow". The open task due soonest; red when
// it is already overdue.
function NextLine({ next }: { next: { title: string; due: string } }) {
  const today = todayIso();
  const overdue = next.due < today;
  return (
    <p className="flex min-w-0 gap-1 text-sm">
      <span className="shrink-0 text-muted">Next:</span>
      <span className="truncate text-ink">{next.title}</span>
      <span className={`shrink-0 ${overdue ? "font-medium text-danger" : "text-muted"}`}>
        · {overdue ? "Overdue, " : ""}
        {dueLabel(next.due, today)}
      </span>
    </p>
  );
}
