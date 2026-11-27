"use client";

// One task on the board.
//
//   [status edge] Title (opens the task panel)
//                 Description, two lines at most
//                 [priority] [due date]
//                 [status]                        (assignee avatar)
//
// The left edge is the status colour, the same as the column header. The
// status control moves the task through the move endpoint, the only way the
// backend lets status change; viewers, who cannot move tasks, get a read-only
// status pill instead.
//
// Colour is never the only signal: priority has bars and a word, an overdue
// date says "Overdue" to screen readers and is bold, the status has its
// icon and name, and the avatar has the person's name as its label.
//
// The whole card opens the task. The title is still the one real button
// (one clear control for keyboards and screen readers); its ::after layer
// is stretched over the whole card, so a click anywhere lands on it. The
// status control sits above that layer (relative z-10), so it keeps working
// and never opens the task. The focus ring is drawn around the whole card
// while the title button has keyboard focus.
// isolate keeps that z-10 inside the card, so a scrolled card never paints
// over the sticky top bar.

import { useState } from "react";
import { StatusBadge, StatusIcon, statusStyle } from "../status/Status";
import { PriorityBars } from "../ui/PriorityBars";
import { Select } from "../ui/Select";
import { moveTask } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { dueLabel, todayIso } from "@/lib/projectStats";
import { STATUSES, type Task, type TaskPriority, type TaskStatus } from "@/lib/types";

// Priority chips stay neutral except high, so they never look like a status
// (amber is In review, for example). The bars say the level without colour.
const priorityLook: Record<TaskPriority, { chip: string }> = {
  low: { chip: "bg-page text-muted" },
  medium: { chip: "bg-page text-ink" },
  high: { chip: "bg-danger-bg text-danger" },
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
  const s = statusStyle[task.status];
  const today = todayIso();
  const overdue = task.status !== "done" && task.due_date !== null && task.due_date < today;
  const pri = priorityLook[task.priority];

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
    <article
      className={`group relative isolate cursor-pointer space-y-2.5 rounded-lg border border-l-[3px] border-line bg-card p-3 shadow-sm transition-[translate,box-shadow] duration-150 hover:shadow-md motion-safe:hover:-translate-y-0.5 has-[.card-open:focus-visible]:outline-2 has-[.card-open:focus-visible]:outline-offset-2 has-[.card-open:focus-visible]:outline-navy ${s.edge}`}
    >
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => onOpen(task)}
          // card-open: the hook the card's focus ring looks for. Its own
          // ring is turned off, since the card draws one around everything.
          className={`card-open block w-full cursor-pointer text-left text-sm leading-snug font-semibold outline-none group-hover:text-navy after:absolute after:inset-0 after:rounded-lg after:content-[''] ${
            task.status === "done" ? "text-muted line-through" : "text-ink"
          }`}
        >
          {task.title}
        </button>
        {task.description && <p className="line-clamp-2 text-xs leading-relaxed text-muted">{task.description}</p>}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${pri.chip}`}>
          <PriorityBars priority={task.priority} />
          <span className="sr-only">Priority: </span>
          {task.priority}
        </span>
        {task.due_date && (
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs ${
              overdue ? "bg-danger-bg font-semibold text-danger" : "bg-page text-muted"
            }`}
          >
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
              <rect x="2" y="3" width="12" height="11" rx="2" />
              <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
            </svg>
            <span className="sr-only">{overdue ? "Overdue, was due " : "Due "}</span>
            {dueLabel(task.due_date, today)}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        {canMove ? (
          // relative z-10: above the card's click layer, so the dropdown
          // keeps working and never opens the task.
          <div className="relative z-10">
            <Select
              aria-label="Status"
              size="sm"
              value={task.status}
              disabled={busy}
              onChange={(v) => changeStatus(v as TaskStatus)}
              options={STATUSES.map((st) => ({
                value: st.value,
                label: st.label,
                icon: <StatusIcon status={st.value} className={`h-3 w-3 ${statusStyle[st.value].icon}`} />,
              }))}
              // Tinted in the current status's colours, like the column header.
              look={`rounded-full border ${s.bg} ${s.text} ${s.fieldBorder} disabled:opacity-60`}
            />
          </div>
        ) : (
          <StatusBadge status={task.status} size="sm" />
        )}
        <Avatar name={task.assignee?.full_name ?? null} />
      </div>

      {busy && <p className="text-xs text-muted">Moving...</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </article>
  );
}

// The assignee's initial in a small circle, the full name as its label and
// tooltip. Nobody assigned: a dashed outline with a person icon.
function Avatar({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span
        role="img"
        aria-label="Unassigned"
        title="Unassigned"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted/50 text-muted"
      >
        <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="5.5" r="2.5" />
          <path d="M3.5 13.5c.8-2.3 2.5-3.5 4.5-3.5s3.7 1.2 4.5 3.5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      role="img"
      aria-label={`Assigned to ${name}`}
      title={name}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white"
    >
      {name.trim().charAt(0).toUpperCase()}
    </span>
  );
}
