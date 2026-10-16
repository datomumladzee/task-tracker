// What the task panel sends on save: only the fields that changed.
//
// TaskUpdate (backend/app/tasks/schemas.py) is read with exclude_unset, so:
//   key missing      leave the field alone
//   key with null    clear it (description, due_date, assignee_id only)
// An empty description, an empty date or "Unassigned" therefore become null,
// which really clears them, rather than being left out, which would not.

import type { Task, TaskPriority, TaskUpdate } from "./types";

// The form keeps everything as strings, the way inputs and selects do.
// "" means empty for description, due date and assignee.
export type TaskForm = {
  title: string;
  description: string;
  due_date: string;
  priority: TaskPriority;
  assignee_id: string;
};

export function formFrom(task: Task): TaskForm {
  return {
    title: task.title,
    description: task.description ?? "",
    due_date: task.due_date ?? "",
    priority: task.priority,
    assignee_id: task.assignee ? String(task.assignee.id) : "",
  };
}

export function changes(task: Task, form: TaskForm): TaskUpdate {
  const before = formFrom(task);
  const body: TaskUpdate = {};
  // The backend strips the title too; trimming here keeps "  x " from
  // counting as a change when it is not.
  if (form.title.trim() !== before.title) body.title = form.title.trim();
  if (form.description !== before.description) body.description = form.description || null;
  if (form.due_date !== before.due_date) body.due_date = form.due_date || null;
  if (form.priority !== before.priority) body.priority = form.priority;
  if (form.assignee_id !== before.assignee_id) {
    body.assignee_id = form.assignee_id ? Number(form.assignee_id) : null;
  }
  return body;
}
