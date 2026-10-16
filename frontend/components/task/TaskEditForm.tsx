"use client";

// The task's fields. Editable for standard and admin, read-only for viewers,
// who may see a task but not change it.

import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { updateTask } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { changes, formFrom, type TaskForm } from "@/lib/taskEdit";
import { PRIORITIES, type Member, type Task } from "@/lib/types";

type Props = {
  task: Task;
  members: Member[];
  canEdit: boolean;
  onSaved: (task: Task) => void;
};

const fieldClass = "w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm disabled:bg-zinc-50 disabled:text-zinc-700";

export function TaskEditForm({ task, members, canEdit, onSaved }: Props) {
  const [form, setForm] = useState<TaskForm>(() => formFrom(task));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const body = changes(task, form);
  const dirty = Object.keys(body).length > 0;

  function set<K extends keyof TaskForm>(key: K, value: TaskForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const updated = await updateTask(task.project_id, task.id, body);
      onSaved(updated);
      // Reset to the server's copy, so "dirty" compares against what is
      // really stored now.
      setForm(formFrom(updated));
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Title</span>
        <input aria-label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} disabled={!canEdit} className={fieldClass} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Description</span>
        <textarea aria-label="Description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} disabled={!canEdit} className={fieldClass} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Due date</span>
          <input aria-label="Due date" type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} disabled={!canEdit} className={fieldClass} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Priority</span>
          <select aria-label="Priority" value={form.priority} onChange={(e) => set("priority", e.target.value as TaskForm["priority"])} disabled={!canEdit} className={fieldClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Assignee</span>
        <select aria-label="Assignee" value={form.assignee_id} onChange={(e) => set("assignee_id", e.target.value)} disabled={!canEdit} className={fieldClass}>
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>{m.user.full_name}</option>
          ))}
          {/* Someone who left the project can still be the assignee. Keep
              them selectable, or the dropdown would silently show the wrong
              person. */}
          {task.assignee && !members.some((m) => m.user.id === task.assignee!.id) && (
            <option value={task.assignee.id}>{task.assignee.full_name} (not a member)</option>
          )}
        </select>
      </label>
      <ErrorText message={error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || busy || !form.title.trim()}>{busy ? "Saving..." : "Save changes"}</Button>
          {saved && !dirty && <span className="text-sm text-emerald-700">Saved</span>}
        </div>
      )}
    </form>
  );
}
