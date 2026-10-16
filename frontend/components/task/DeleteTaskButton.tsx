"use client";

// Deleting is the one task action the backend cannot undo, and it takes the
// comments with it, so it goes through ConfirmButton's second click.

import { ConfirmButton } from "../ui/ConfirmButton";
import { deleteTask } from "@/lib/endpoints";
import type { Task } from "@/lib/types";

export function DeleteTaskButton({ task, onDeleted }: { task: Task; onDeleted: (id: number) => void }) {
  return (
    <ConfirmButton
      label="Delete task"
      question="Delete this task and its comments? This cannot be undone."
      yes="Yes, delete"
      onConfirm={async () => {
        await deleteTask(task.project_id, task.id);
        onDeleted(task.id);
      }}
    />
  );
}
