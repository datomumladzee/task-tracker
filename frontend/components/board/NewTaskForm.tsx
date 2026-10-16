"use client";

// The plain way to add a task, next to the AI way. Title and priority only;
// the rest can wait for the task detail view in week 5.

import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { createTask } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { PRIORITIES, type Task, type TaskPriority } from "@/lib/types";

type Props = {
  projectId: number;
  onCreated: (task: Task) => void;
};

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
          className="flex-1 rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        />
        <select
          aria-label="Priority"
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded border border-zinc-300 bg-white px-2 text-sm"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        <Button type="submit" disabled={busy || !title.trim()}>Add</Button>
      </div>
      <ErrorText message={error} />
    </form>
  );
}
