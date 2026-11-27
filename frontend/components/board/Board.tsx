// Four columns, one per status. Pure layout: the page owns the task list.

import { TaskCard } from "./TaskCard";
import { StatusIcon, statusStyle } from "../status/Status";
import { STATUSES, type Task } from "@/lib/types";

type Props = {
  tasks: Task[];
  canMove: boolean;
  onMoved: (task: Task) => void;
  onOpen: (task: Task) => void;
};

export function Board({ tasks, canMove, onMoved, onOpen }: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-4">
      {STATUSES.map((column) => {
        // Position is the backend's order inside a column, so sorting by it
        // shows the same order the API would return.
        const cards = tasks.filter((t) => t.status === column.value).sort((a, b) => a.position - b.position);
        const s = statusStyle[column.value];
        return (
          // The top border in the status colour is the thin line along the
          // top edge; being a border, it follows the rounded corners.
          <section key={column.value} className={`space-y-2 rounded-lg border border-t-[3px] border-line bg-card p-3 ${s.line}`}>
            <h2 className="flex items-center gap-2 pb-1 text-sm font-semibold text-ink">
              <StatusIcon status={column.value} className={`h-3.5 w-3.5 ${s.icon}`} />
              {column.label}
              <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${s.bg} ${s.text}`}>
                <span className="sr-only">Tasks: </span>
                {cards.length}
              </span>
            </h2>
            {cards.length === 0 && <p className="py-2 text-center text-xs text-muted">No tasks</p>}
            {cards.map((t) => (
              <TaskCard key={t.id} task={t} canMove={canMove} onMoved={onMoved} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
