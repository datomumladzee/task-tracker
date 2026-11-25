"use client";

// My tasks as a calendar, by due date. Month grid from 640px up; a week
// list on phones, where seven columns are unreadable.
//
// Days are plain labelled lists of links, not an interactive grid: a screen
// reader hears "Thursday, November 26" and then the tasks, and Tab moves
// through the tasks. Tasks without a due date are counted under the
// calendar, with a link back to the list.

import { useState } from "react";
import Link from "next/link";
import { LetterTile } from "../projects/LetterTile";
import {
  addDays,
  addMonths,
  groupOf,
  longDay,
  monthLabel,
  monthWeeks,
  shortDay,
  startOfWeek,
  weekOf,
  weekRange,
  type MyTask,
} from "@/lib/projectStats";

type Props = {
  items: MyTask[];
  today: string;
  onShowList: () => void;
};

// A cell shows at most this many lines; past that, two tasks and "+N more".
const MAX_LINES = 3;

export function TaskCalendar({ items, today, onShowList }: Props) {
  const byDay = new Map<string, MyTask[]>();
  let undated = 0;
  for (const item of items) {
    const due = item.task.due_date;
    if (!due) {
      undated += 1;
      continue;
    }
    byDay.set(due, [...(byDay.get(due) ?? []), item]);
  }

  return (
    <div className="space-y-4">
      <div className="hidden sm:block">
        <MonthView byDay={byDay} today={today} />
      </div>
      <div className="sm:hidden">
        <WeekView byDay={byDay} today={today} />
      </div>
      {undated > 0 && (
        <p className="text-sm text-muted">
          {undated === 1 ? "1 task has" : `${undated} tasks have`} no due date.{" "}
          <button type="button" onClick={onShowList} className="font-medium text-navy underline">
            See them in the list
          </button>
        </p>
      )}
    </div>
  );
}

// --- month --------------------------------------------------------------------

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function MonthView({ byDay, today }: { byDay: Map<string, MyTask[]>; today: string }) {
  const [month, setMonth] = useState(today.slice(0, 7));
  // Days whose "+N more" was opened, so they show every task.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <section aria-label="Month" className="space-y-3">
      <Nav
        label={monthLabel(month)}
        onPrev={() => setMonth(addMonths(month, -1))}
        onNext={() => setMonth(addMonths(month, 1))}
        onToday={() => setMonth(today.slice(0, 7))}
        prevLabel="Previous month"
        nextLabel="Next month"
      />
      <div className="overflow-hidden rounded-xl border border-line bg-card">
        <div className="grid grid-cols-7 border-b border-line bg-page text-xs font-semibold text-muted" aria-hidden="true">
          {WEEKDAYS.map((d) => (
            <span key={d} className="px-2 py-2">
              {d}
            </span>
          ))}
        </div>
        <ol className="grid grid-cols-7">
          {monthWeeks(month).flat().map((day) => {
            const list = byDay.get(day) ?? [];
            const open = expanded.has(day);
            const shown = open || list.length <= MAX_LINES ? list : list.slice(0, MAX_LINES - 1);
            const inMonth = day.startsWith(month);
            const isToday = day === today;
            return (
              <li
                key={day}
                // Today: a navy inset outline, so it does not shift the grid.
                className={`min-h-28 min-w-0 space-y-1 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0 ${
                  inMonth ? "" : "bg-page/60"
                } ${isToday ? "ring-2 ring-navy ring-inset" : ""}`}
              >
                <p className={`px-1 text-xs ${isToday ? "font-semibold text-navy" : inMonth ? "text-ink" : "text-muted"}`}>
                  <span aria-hidden="true">{Number(day.slice(8))}</span>
                  <span className="sr-only">
                    {longDay(day)}
                    {isToday && ", today"}
                  </span>
                </p>
                {list.length > 0 && (
                  <ul aria-label={`${list.length} ${list.length === 1 ? "task" : "tasks"}`} className="space-y-1">
                    {shown.map((item) => (
                      <li key={item.task.id}>
                        <Chip item={item} today={today} />
                      </li>
                    ))}
                    {shown.length < list.length && (
                      <li>
                        <button
                          type="button"
                          onClick={() => setExpanded(new Set(expanded).add(day))}
                          className="w-full rounded px-1.5 text-left text-xs font-medium text-navy hover:underline"
                        >
                          +{list.length - shown.length} more
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

// --- week (phones) ---------------------------------------------------------------

function WeekView({ byDay, today }: { byDay: Map<string, MyTask[]>; today: string }) {
  const [start, setStart] = useState(startOfWeek(today));
  const thisWeek = startOfWeek(today);

  return (
    <section aria-label="Week" className="space-y-3">
      <Nav
        label={start === thisWeek ? `This week · ${weekRange(start)}` : weekRange(start)}
        onPrev={() => setStart(addDays(start, -7))}
        onNext={() => setStart(addDays(start, 7))}
        onToday={() => setStart(thisWeek)}
        prevLabel="Previous week"
        nextLabel="Next week"
      />
      <ol className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-card">
        {weekOf(start).map((day) => {
          const list = byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <li key={day} className={`space-y-2 px-3 py-3 ${isToday ? "bg-page" : ""}`}>
              <p className={`text-sm ${isToday ? "font-semibold text-navy" : "font-medium text-ink"}`}>
                <span aria-hidden="true">
                  {shortDay(day)}
                  {isToday && " · Today"}
                </span>
                <span className="sr-only">
                  {longDay(day)}
                  {isToday && ", today"}
                </span>
              </p>
              {list.length === 0 ? (
                <p className="text-sm text-muted">No tasks</p>
              ) : (
                <ul aria-label={`${list.length} ${list.length === 1 ? "task" : "tasks"}`} className="space-y-1.5">
                  {list.map((item) => (
                    <li key={item.task.id}>
                      <Chip item={item} today={today} roomy />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// --- shared ---------------------------------------------------------------------

function Nav(props: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  prevLabel: string;
  nextLabel: string;
}) {
  const arrow = "flex h-9 w-9 items-center justify-center rounded border border-line bg-card text-ink hover:border-navy";
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={props.onPrev} aria-label={props.prevLabel} className={arrow}>
        <span aria-hidden="true">‹</span>
      </button>
      {/* aria-live, so moving month or week is announced. */}
      <h2 aria-live="polite" className="min-w-0 flex-1 truncate text-center font-brand font-semibold text-ink sm:flex-none sm:px-2">
        {props.label}
      </h2>
      <button type="button" onClick={props.onNext} aria-label={props.nextLabel} className={arrow}>
        <span aria-hidden="true">›</span>
      </button>
      <button type="button" onClick={props.onToday} className="ml-1 rounded border border-line bg-card px-3 py-1.5 text-sm font-medium text-ink hover:border-navy sm:ml-auto">
        Today
      </button>
    </div>
  );
}

// One task: the project's tiny tile and the title, linking to its board.
// Overdue is red on pale red (6.0:1), done is struck through.
function Chip({ item, today, roomy = false }: { item: MyTask; today: string; roomy?: boolean }) {
  const { task, project } = item;
  const overdue = groupOf(task, today) === "overdue";
  const done = task.status === "done";
  const look = overdue ? "bg-danger-bg text-danger" : done ? "bg-page text-muted line-through" : "bg-page text-ink hover:bg-line/60";
  return (
    <Link
      href={`/projects/${project.id}`}
      title={`${task.title} · ${project.name}`}
      className={`flex min-w-0 items-center gap-1.5 rounded ${roomy ? "px-2 py-1.5 text-sm" : "px-1.5 py-0.5 text-xs"} ${look}`}
    >
      <LetterTile id={project.id} name={project.name} size="xs" />
      <span className="truncate">{task.title}</span>
      {/* Said in words too, so it does not rest on colour alone. */}
      {overdue && <span className="sr-only">, overdue</span>}
      <span className="sr-only">, in {project.name}</span>
    </Link>
  );
}
