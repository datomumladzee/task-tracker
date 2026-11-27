"use client";

// The plain way to add a task, next to the AI way. Title and priority only;
// the rest can wait for the task detail view in week 5.

import { useState } from "react";
import { Button } from "../ui/Button";
import { PriorityBars } from "../ui/PriorityBars";
import { Select } from "../ui/Select";
import { ErrorText } from "../ui/ErrorText";
import { createTask } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { PRIORITIES, type Task, type TaskPriority } from "@/lib/types";

type Props = {
  projectId: number;
  onCreated: (task: Task) => void;
};

const priorityOptions = PRIORITIES.map((p) => ({
  value: p,
  label: p,
  icon: <PriorityBars priority={p} className={`h-3.5 w-3.5 ${p === "high" ? "text-danger" : ""}`} />,
}));

export function NewTaskForm({ projectId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // No status: the backend default is todo, and new tasks go to the
      // bottom of that column.
      onCreated(await createTask(projectId, { title, priority }));
      setTitle("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <div className="flex gap-2">
        <input
          aria-label="New task title"
          placeholder="New task title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          // min-w-0: an input has a built-in minimum width, which pushed the
          // Add button 3px off a 375px screen.
          className="min-w-0 flex-1 rounded border border-line bg-card px-2 py-1.5 text-sm placeholder:text-muted hover:border-muted/50 focus:border-navy"
        />
        {/* The shared dropdown, the same height as the title field, with
            the priority bars from the task cards; red only for high. */}
        <Select
          aria-label="Priority"
          value={priority}
          onChange={(v) => setPriority(v as TaskPriority)}
          options={priorityOptions}
          look={priority === "high" ? "rounded border border-danger/40 bg-danger-bg text-danger" : undefined}
        />
        <Button type="submit" variant="secondary" disabled={busy || !title.trim()}>Add</Button>
      </div>
      <ErrorText message={error} />
    </form>
  );
}
