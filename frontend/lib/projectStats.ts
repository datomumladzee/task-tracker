// What a project card shows about its tasks, worked out in the browser from
// GET /projects/{id}/tasks. No backend summary exists yet; with many projects
// that one request per card would be the reason to add one.

import type { Task, TaskStatus } from "./types";

export type ProjectStats = {
  total: number;
  byStatus: Record<TaskStatus, number>;
  open: number; // everything not done
  overdue: number; // open, with a due date before today
  mine: number; // open and assigned to the signed-in user
  // The open task due soonest, for the card's "Next" line. Undated tasks are
  // left out: without a date, "next" would just be an arbitrary pick.
  next: { title: string; due: string } | null;
};

// Today as YYYY-MM-DD in the user's own timezone, the same shape as
// due_date, so the two compare as plain strings.
export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function summarize(tasks: Task[], userId: number, today: string): ProjectStats {
  const byStatus: Record<TaskStatus, number> = { todo: 0, in_progress: 0, in_review: 0, done: 0 };
  let overdue = 0;
  let mine = 0;
  let next: ProjectStats["next"] = null;
  for (const t of tasks) {
    byStatus[t.status] += 1;
    if (t.status === "done") continue;
    if (t.due_date && t.due_date < today) overdue += 1;
    if (t.assignee?.id === userId) mine += 1;
    if (t.due_date && (!next || t.due_date < next.due)) next = { title: t.title, due: t.due_date };
  }
  return { total: tasks.length, byStatus, open: tasks.length - byStatus.done, overdue, mine, next };
}

// "3 days ago", "yesterday", "2 hours ago". Intl does the wording and the
// plurals; we only pick the unit.
const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(iso: string, now: number = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(seconds) < 60) return "just now";
  const format = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

// Adds days to a YYYY-MM-DD date in local time and returns the same shape.
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// "Today", "Tomorrow", "Yesterday", else "Nov 20" (with the year when it is
// not this year). Parsed as a local date, so it never shifts a day.
export function dueLabel(iso: string, today: string): string {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  if (iso === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = iso.split("-").map(Number);
  const sameYear = iso.slice(0, 4) === today.slice(0, 4);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) }).format(new Date(y, m - 1, d));
}
