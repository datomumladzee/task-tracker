"use client";

// Every task assigned to you, across all your projects, grouped by how soon
// it is due: Overdue, Due this week, Later, No due date. Done tasks stay out
// unless "Show done" is ticked.
//
// Two views of the same tasks, List and Calendar, chosen with ?view=calendar
// so a view can be bookmarked. Built from the same data as the Projects page
// (useProjectsWithTasks), so it needs no backend endpoint of its own. It fills
// in as each project's tasks arrive; a project whose request failed is named
// under the list.

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MyTaskRow } from "@/components/tasks/MyTaskRow";
import { TaskCalendar } from "@/components/tasks/TaskCalendar";
import { ErrorText } from "@/components/ui/ErrorText";
import { useAuth } from "@/lib/auth";
import { GROUPS, groupOf, myTasks, todayIso, type Group, type MyTask } from "@/lib/projectStats";
import { useProjectsWithTasks } from "@/lib/useProjectsWithTasks";

// useSearchParams needs a Suspense boundary around it, or Next renders the
// whole route only in the browser (see its use-search-params docs).
export default function MyTasksPage() {
  return (
    <Suspense fallback={null}>
      <MyTasks />
    </Suspense>
  );
}

type View = "list" | "calendar";

function MyTasks() {
  const router = useRouter();
  const pathname = usePathname();
  const view: View = useSearchParams().get("view") === "calendar" ? "calendar" : "list";
  // replace, not push: switching views should not fill the Back history.
  const setView = (v: View) => router.replace(v === "calendar" ? `${pathname}?view=calendar` : pathname, { scroll: false });

  const { user } = useAuth();
  const { projects, error, tasks } = useProjectsWithTasks();
  const [showDone, setShowDone] = useState(false);
  const today = todayIso();

  const items = projects && user ? myTasks(projects, tasks, user.id, showDone) : [];
  const groups = new Map<Group, MyTask[]>();
  for (const item of items) {
    const key = groupOf(item.task, today);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }

  const open = items.filter((i) => i.task.status !== "done").length;
  const overdue = groups.get("overdue")?.length ?? 0;
  const loading = projects?.filter((p) => tasks[p.id] === undefined) ?? [];
  const failed = projects?.filter((p) => tasks[p.id] === "error") ?? [];
  const settled = projects !== null && loading.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-brand text-2xl font-semibold text-ink">My tasks</h1>
          {settled && items.length > 0 && (
            <p className="text-sm text-muted">
              {open} open
              {overdue > 0 && (
                <>
                  {" · "}
                  <span className="font-medium text-danger">{overdue} overdue</span>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {/* A real checkbox: the simplest control that every screen reader
              and keyboard already understands. */}
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} className="h-4 w-4 accent-navy" />
            Show done
          </label>
          {/* Two toggle buttons; aria-pressed says which view is on. The
              active one is a white chip on a grey track. */}
          <div role="group" aria-label="View" className="flex rounded-lg bg-line/60 p-1">
            {(["list", "calendar"] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`rounded-md px-3 py-1 text-sm font-medium ${view === v ? "bg-card text-navy shadow-sm" : "text-muted hover:text-ink"}`}
              >
                {v === "list" ? "List" : "Calendar"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ErrorText message={error} />

      {(projects === null || (items.length === 0 && !settled)) && !error && (
        <div className="space-y-3" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-16 rounded-xl border border-line bg-card motion-safe:animate-pulse" />
          ))}
        </div>
      )}

      {settled && items.length === 0 && !error && (
        <div className="rounded-xl border border-dashed border-line bg-card px-6 py-10 text-center">
          <h2 className="font-brand text-lg font-semibold text-ink">Nothing assigned to you</h2>
          <p className="mt-1 text-sm text-muted">Tasks you are assigned show up here, from every project you are in.</p>
        </div>
      )}

      {view === "calendar" && items.length > 0 && (
        <TaskCalendar items={items} today={today} onShowList={() => setView("list")} />
      )}

      {view === "list" && GROUPS.map(({ key, label }) => {
        const list = groups.get(key);
        if (!list?.length) return null;
        return (
          <section key={key} aria-labelledby={`group-${key}`} className="space-y-3">
            <h2 id={`group-${key}`} className={`text-sm font-semibold ${key === "overdue" ? "text-danger" : "text-ink"}`}>
              {label} <span className="font-normal text-muted">{list.length}</span>
            </h2>
            <ul className="space-y-2">
              {list.map((item) => (
                <li key={item.task.id}>
                  <MyTaskRow item={item} today={today} overdue={key === "overdue"} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {/* Quiet notes, not errors: the rest of the list is still right. */}
      {items.length > 0 && loading.length > 0 && (
        <p className="text-sm text-muted">Still loading tasks from {loading.length === 1 ? "1 project" : `${loading.length} projects`}...</p>
      )}
      {failed.length > 0 && (
        <p className="text-sm text-muted">Could not load tasks from {failed.map((p) => p.name).join(", ")}.</p>
      )}
    </div>
  );
}
