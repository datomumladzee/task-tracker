// One task on the My tasks page. The whole row links to the task's board.
//
// Title on the first line; project and status under it; the due date on the
// right (under the title on phones). An overdue date is red.

import Link from "next/link";
import { LetterTile } from "../projects/LetterTile";
import { StatusBadge } from "../status/Status";
import { dueLabel, type MyTask } from "@/lib/projectStats";

export function MyTaskRow({ item, today, overdue }: { item: MyTask; today: string; overdue: boolean }) {
  const { task, project } = item;

  return (
    <Link
      href={`/projects/${project.id}`}
      className="flex flex-col gap-2 rounded-xl border border-line bg-card px-4 py-3 shadow-sm transition-colors hover:border-navy sm:flex-row sm:items-center sm:gap-4"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <p className={`truncate font-medium ${task.status === "done" ? "text-muted line-through" : "text-ink"}`}>{task.title}</p>
        <p className="flex min-w-0 items-center gap-2 text-sm text-muted">
          <LetterTile id={project.id} name={project.name} size="sm" />
          <span className="truncate">{project.name}</span>
          <span aria-hidden="true">·</span>
          <StatusBadge status={task.status} size="sm" />
        </p>
      </div>
      {task.due_date && (
        <p className={`shrink-0 text-sm ${overdue ? "font-medium text-danger" : "text-muted"}`}>
          {/* "Due" is said in words for screen readers; sighted users read it
              from the group heading and the position. */}
          <span className="sr-only">Due </span>
          {dueLabel(task.due_date, today)}
        </p>
      )}
    </Link>
  );
}
