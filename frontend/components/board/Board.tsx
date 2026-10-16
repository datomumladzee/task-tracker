// Four columns, one per status. Pure layout: the page owns the task list.

import { TaskCard } from "./TaskCard";
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
        return (
          <section key={column.value} className="space-y-2 rounded-lg bg-zinc-100 p-3">
            <h2 className="flex justify-between text-sm font-semibold text-zinc-700">
              {column.label}
              <span className="font-normal text-zinc-500">{cards.length}</span>
            </h2>
            {cards.length === 0 && <p className="py-2 text-center text-xs text-zinc-400">No tasks</p>}
            {cards.map((t) => (
              <TaskCard key={t.id} task={t} canMove={canMove} onMoved={onMoved} onOpen={onOpen} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
