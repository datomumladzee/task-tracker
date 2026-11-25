// What a project card shows about its tasks, worked out in the browser from
// GET /projects/{id}/tasks. No backend summary exists yet; with many projects
// that one request per card would be the reason to add one.

import type { Project, Task, TaskStatus } from "./types";

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

// --- My tasks ----------------------------------------------------------------

export type MyTask = { task: Task; project: Project };

// Overdue and due dates only mean something for open work, so a done task
// goes in "done" whatever its date.
export type Group = "overdue" | "week" | "later" | "none" | "done";

export const GROUPS: { key: Group; label: string }[] = [
  { key: "overdue", label: "Overdue" },
  { key: "week", label: "Due this week" },
  { key: "later", label: "Later" },
  { key: "none", label: "No due date" },
  { key: "done", label: "Done" },
];

// Adds days to a YYYY-MM-DD date in local time and returns the same shape.
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function groupOf(task: Task, today: string): Group {
  if (task.status === "done") return "done";
  if (!task.due_date) return "none";
  if (task.due_date < today) return "overdue";
  // This week means today and the six days after it.
  if (task.due_date <= addDays(today, 6)) return "week";
  return "later";
}

// Every task assigned to userId across the loaded projects, soonest due
// first and undated last, then by title. Projects still loading or failed
// are skipped; the page says which.
export function myTasks(projects: Project[], tasks: Record<number, Task[] | "error">, userId: number, includeDone: boolean): MyTask[] {
  const mine: MyTask[] = [];
  for (const project of projects) {
    const list = tasks[project.id];
    if (!Array.isArray(list)) continue;
    for (const task of list) {
      if (task.assignee?.id !== userId) continue;
      if (task.status === "done" && !includeDone) continue;
      mine.push({ task, project });
    }
  }
  return mine.sort((a, b) => {
    const da = a.task.due_date ?? "9999-99-99";
    const db = b.task.due_date ?? "9999-99-99";
    return da === db ? a.task.title.localeCompare(b.task.title) : da < db ? -1 : 1;
  });
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

// --- Calendar ----------------------------------------------------------------
// Weeks start on Monday. Every date is a YYYY-MM-DD string in local time, the
// same shape as due_date, so days compare and key as plain strings.

function isoOf(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function dateOf(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// The Monday on or before the given day.
export function startOfWeek(iso: string): string {
  const day = dateOf(iso).getDay(); // 0 Sunday ... 6 Saturday
  return addDays(iso, -((day + 6) % 7));
}

export function weekOf(startIso: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(startIso, i));
}

// "2026-11" plus or minus whole months.
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return isoOf(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

// The weeks shown for a month: from the Monday on or before the 1st to the
// Sunday on or after the last day, so every row is a full week.
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const last = addDays(addMonths(month, 1) + "-01", -1);
  const weeks: string[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) weeks.push(weekOf(start));
  return weeks;
}

export function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(dateOf(`${month}-01`));
}

// "Thursday, November 26"
export function longDay(iso: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(dateOf(iso));
}

// "Thu 26"
export function shortDay(iso: string): string {
  const d = dateOf(iso);
  return `${new Intl.DateTimeFormat("en", { weekday: "short" }).format(d)} ${d.getDate()}`;
}

// "Nov 23 – 29", or "Nov 30 – Dec 6" across a month.
export function weekRange(startIso: string): string {
  const end = addDays(startIso, 6);
  const fmt = (iso: string, withMonth: boolean) =>
    new Intl.DateTimeFormat("en", withMonth ? { month: "short", day: "numeric" } : { day: "numeric" }).format(dateOf(iso));
  return `${fmt(startIso, true)} – ${fmt(end, startIso.slice(5, 7) !== end.slice(5, 7))}`;
}
