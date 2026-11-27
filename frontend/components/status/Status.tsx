// How a task status looks, in one place: its colours, its icon and its pill.
// Everything that shows a status uses these, so the board, task cards, the
// task panel and My tasks always agree. The colours are theme tokens in
// globals.css (status-*); the classes are written out in full here so
// Tailwind finds them.
//
// Icons, one shape per status, so colour is never the only difference:
//   To do        a filled dot
//   In progress  a dot inside a ring
//   In review    a ring
//   Done         a check in a filled circle

import { STATUSES, type TaskStatus } from "@/lib/types";

// line: the top border of a board column; edge: the left border of a task card.
export const statusStyle: Record<TaskStatus, { line: string; edge: string; icon: string; text: string; bg: string; fieldBorder: string }> = {
  todo: {
    line: "border-t-status-todo",
    edge: "border-l-status-todo",
    icon: "text-status-todo",
    text: "text-status-todo-text",
    bg: "bg-status-todo-bg",
    fieldBorder: "border-status-todo/40",
  },
  in_progress: {
    line: "border-t-status-in-progress",
    edge: "border-l-status-in-progress",
    icon: "text-status-in-progress",
    text: "text-status-in-progress-text",
    bg: "bg-status-in-progress-bg",
    fieldBorder: "border-status-in-progress/40",
  },
  in_review: {
    line: "border-t-status-in-review",
    edge: "border-l-status-in-review",
    icon: "text-status-in-review",
    text: "text-status-in-review-text",
    bg: "bg-status-in-review-bg",
    fieldBorder: "border-status-in-review/40",
  },
  done: {
    line: "border-t-status-done",
    edge: "border-l-status-done",
    icon: "text-status-done",
    text: "text-status-done-text",
    bg: "bg-status-done-bg",
    fieldBorder: "border-status-done/40",
  },
};

export function statusLabel(status: TaskStatus): string {
  return STATUSES.find((s) => s.value === status)?.label ?? status;
}

// Drawn in currentColor; pass the colour class (statusStyle[x].icon) or let
// it inherit. Decoration: the label next to it says the status in words.
export function StatusIcon({ status, className = "h-3.5 w-3.5" }: { status: TaskStatus; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={`shrink-0 ${className}`} aria-hidden="true">
      {status === "todo" && <circle cx="8" cy="8" r="4.5" fill="currentColor" />}
      {status === "in_progress" && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="8" cy="8" r="2.6" fill="currentColor" />
        </>
      )}
      {status === "in_review" && <circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" strokeWidth="2.2" />}
      {status === "done" && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5 8.2l2 2 4-4.2" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

// A small pill: tint, darker text, the icon in the status colour.
export function StatusBadge({ status, size = "md" }: { status: TaskStatus; size?: "sm" | "md" }) {
  const s = statusStyle[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium ${s.bg} ${s.text} ${
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm"
      }`}
    >
      <StatusIcon status={status} className={`${size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} ${s.icon}`} />
      {statusLabel(status)}
    </span>
  );
}
