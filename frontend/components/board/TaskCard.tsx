"use client";

// One task on the board. The title opens the task panel. The dropdown moves
// the task to another column through the move endpoint, the only way the
// backend lets status change; viewers, who cannot move tasks, get a label.

import { useState } from "react";
import { moveTask } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { STATUSES, type Task, type TaskStatus } from "@/lib/types";

const priorityLook = {
  low: "text-zinc-500",
  medium: "text-amber-700",
  high: "text-red-700",
};

type Props = {
  task: Task;
  canMove: boolean;
  onMoved: (task: Task) => void;
  onOpen: (task: Task) => void;
};

export function TaskCard({ task, canMove, onMoved, onOpen }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(status: TaskStatus) {
    setBusy(true);
    setError(null);
    try {
      // Decision: wait for the server instead of moving the card first. The
      // reply carries the new position, and a failed move never shows a card
      // that jumps and then jumps back.
      onMoved(await moveTask(task.project_id, task.id, status));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="space-y-2 rounded border border-zinc-200 bg-white p-3 text-sm shadow-sm">
      <button type="button" onClick={() => onOpen(task)} className="block w-full text-left font-medium hover:underline">
        {task.title}
      </button>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-600">
        <span className={priorityLook[task.priority]}>{task.priority}</span>
        {task.due_date && <span>due {task.due_date}</span>}
        <span>{task.assignee ? task.assignee.full_name : "unassigned"}</span>
      </div>
      {canMove && (
        <select
          aria-label="Status"
          value={task.status}
          disabled={busy}
          onChange={(e) => changeStatus(e.target.value as TaskStatus)}
          className="w-full rounded border border-zinc-300 bg-white px-1 py-1 text-xs"
        >
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )}
      {busy && <p className="text-xs text-zinc-500">Moving...</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </article>
  );
}
