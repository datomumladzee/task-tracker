"use client";

// One task, opened from the board in a panel over the right side of the page.
// Decision: a panel rather than a new route, so the board stays visible and
// every change shows up on it straight away. Escape or the backdrop closes it.

import { useEffect } from "react";
import { Comments } from "./Comments";
import { DeleteTaskButton } from "./DeleteTaskButton";
import { TaskEditForm } from "./TaskEditForm";
import { can } from "@/lib/permissions";
import { STATUSES, type Member, type ProjectRole, type Task } from "@/lib/types";

type Props = {
  task: Task;
  role: ProjectRole;
  members: Member[];
  currentUserId: number;
  onSaved: (task: Task) => void;
  onDeleted: (id: number) => void;
  onClose: () => void;
};

export function TaskPanel({ task, role, members, currentUserId, onSaved, onDeleted, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const status = STATUSES.find((s) => s.value === task.status)?.label;

  return (
    <div className="fixed inset-0 z-20 flex justify-end">
      <button type="button" aria-label="Close task" onClick={onClose} className="absolute inset-0 bg-black/20" />
      <aside role="dialog" aria-modal="true" aria-label={`Task: ${task.title}`} className="relative h-full w-full max-w-md space-y-6 overflow-y-auto bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-500">{status}</span>
          <button type="button" onClick={onClose} className="text-sm text-zinc-600 hover:text-zinc-900">Close</button>
        </div>
        {/* key: a different task gets a fresh form, not the last one's edits. */}
        <TaskEditForm key={task.id} task={task} members={members} canEdit={can.editTask(role)} onSaved={onSaved} />
        <Comments key={`c${task.id}`} task={task} role={role} currentUserId={currentUserId} />
        {can.deleteTask(role) && <DeleteTaskButton task={task} onDeleted={onDeleted} />}
      </aside>
    </div>
  );
}
