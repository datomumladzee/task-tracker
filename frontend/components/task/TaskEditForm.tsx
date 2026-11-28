"use client";

// The task's fields. Editable for standard and admin, read-only for viewers,
// who may see a task but not change it.

import { fieldClass } from "../ui/field";
import { Select } from "../ui/Select";
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

// The app-wide field look (ui/field.ts), at the panel size.
const fieldStyle = fieldClass("md");

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
        <span className="mb-1 block font-medium text-ink">Title</span>
        <input aria-label="Title" value={form.title} onChange={(e) => set("title", e.target.value)} maxLength={200} disabled={!canEdit} className={fieldStyle} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Description</span>
        <textarea aria-label="Description" value={form.description} onChange={(e) => set("description", e.target.value)} rows={3} disabled={!canEdit} className={fieldStyle} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Due date</span>
          <input aria-label="Due date" type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} disabled={!canEdit} className={fieldStyle} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-ink">Priority</span>
          <Select
            aria-label="Priority"
            fullWidth
            value={form.priority}
            onChange={(v) => set("priority", v as TaskForm["priority"])}
            disabled={!canEdit}
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-ink">Assignee</span>
        <Select
          aria-label="Assignee"
          fullWidth
          value={form.assignee_id}
          onChange={(v) => set("assignee_id", v)}
          disabled={!canEdit}
          options={[
            { value: "", label: "Unassigned" },
            ...members.map((m) => ({ value: String(m.user.id), label: m.user.full_name })),
            // Someone who left the project can still be the assignee. Keep
            // them selectable, or the dropdown would silently show the
            // wrong person.
            ...(task.assignee && !members.some((m) => m.user.id === task.assignee!.id)
              ? [{ value: String(task.assignee.id), label: `${task.assignee.full_name} (not a member)` }]
              : []),
          ]}
        />
      </label>
      <ErrorText message={error} />
      {canEdit && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || busy || !form.title.trim()}>{busy ? "Saving..." : "Save changes"}</Button>
          {saved && !dirty && <span className="text-sm text-ok">Saved</span>}
        </div>
      )}
    </form>
  );
}
