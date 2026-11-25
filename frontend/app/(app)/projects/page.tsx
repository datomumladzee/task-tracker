"use client";

// Your projects as cards, with what the app already knows about each: your
// role, when it was made and by whom, and how its tasks stand.
//
// useProjectsWithTasks draws the cards from the projects list at once, then
// fills in each card's bar and counts as that project's tasks arrive.
//
// The header: the title with two chips (how many projects, admin on how
// many), the New project button on the same line, and a role filter that
// narrows the cards. The overview totals always cover every project.

import { useState } from "react";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { Overview } from "@/components/projects/Overview";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { RoleFilter, type RoleFilterValue } from "@/components/projects/RoleFilter";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { useAuth } from "@/lib/auth";
import { summarize, todayIso, type ProjectStats } from "@/lib/projectStats";
import { useProjectsWithTasks } from "@/lib/useProjectsWithTasks";

const NEW_BUTTON_ID = "new-project-button";

export default function ProjectsPage() {
  const { user } = useAuth();
  const { projects, error, tasks, reload } = useProjectsWithTasks();
  const [formOpen, setFormOpen] = useState(false);
  const [filter, setFilter] = useState<RoleFilterValue>("all");
  const today = todayIso();

  function closeForm() {
    setFormOpen(false);
    // The button comes back when the form closes; put focus on it so a
    // keyboard user is not dropped at the top of the page.
    requestAnimationFrame(() => document.getElementById(NEW_BUTTON_ID)?.focus());
  }

  const counts: Record<RoleFilterValue, number> = { all: projects?.length ?? 0, admin: 0, standard: 0, viewer: 0 };
  for (const p of projects ?? []) counts[p.role] += 1;
  // If the chosen role has no projects any more (one was deleted or you
  // left it), fall back to All instead of showing an empty grid.
  const activeFilter: RoleFilterValue = counts[filter] > 0 ? filter : "all";
  const shown = (projects ?? []).filter((p) => activeFilter === "all" || p.role === activeFilter);

  // Counts per project, worked out once and shared by the overview strip and
  // the cards. Loading (undefined) and failed ("error") pass straight
  // through; a loaded list becomes counts once we know who "you" is.
  const statsById = new Map<number, ProjectStats | "error" | undefined>();
  for (const p of projects ?? []) {
    const list = tasks[p.id];
    statsById.set(p.id, Array.isArray(list) ? (user ? summarize(list, user.id, today) : undefined) : list);
  }
  const loaded = [...statsById.values()].filter((s): s is ProjectStats => s !== undefined && s !== "error");
  const settled = projects !== null && [...statsById.values()].every((s) => s !== undefined);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {/* Title and chips on the left, New project on the right, on one
            centre line. On phones the button drops below, full width. */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="font-brand text-3xl font-semibold text-ink">Projects</h1>
            {projects && projects.length > 0 && (
              <>
                <span className="rounded-full border border-line bg-card px-3 py-1 text-sm font-medium text-ink">
                  {counts.all} {counts.all === 1 ? "project" : "projects"}
                </span>
                {counts.admin > 0 && (
                  <span className="rounded-full bg-navy/10 px-3 py-1 text-sm font-medium text-navy">Admin on {counts.admin}</span>
                )}
              </>
            )}
          </div>
          {!formOpen && projects && projects.length > 0 && (
            <Button id={NEW_BUTTON_ID} size="lg" onClick={() => setFormOpen(true)} className="flex w-full items-center justify-center gap-2 sm:w-auto">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              New project
            </Button>
          )}
        </div>
        {projects && projects.length > 0 && <RoleFilter counts={counts} value={activeFilter} onChange={setFilter} />}
      </div>

      {formOpen && (
        <NewProjectForm
          onCancel={closeForm}
          onCreated={() => {
            closeForm();
            reload();
          }}
        />
      )}

      <ErrorText message={error} />

      {projects && projects.length > 0 && <Overview stats={loaded} settled={settled} />}

      {projects === null && !error && (
        // Two card-shaped placeholders while the list loads.
        <div className="grid gap-4 md:grid-cols-2" aria-hidden="true">
          {[0, 1].map((i) => (
            <div key={i} className="h-40 rounded-xl border border-line bg-card motion-safe:animate-pulse" />
          ))}
        </div>
      )}

      {projects?.length === 0 && !formOpen && (
        <div className="space-y-4 rounded-xl border border-dashed border-line bg-card px-6 py-10 text-center">
          <h2 className="font-brand text-lg font-semibold text-ink">No projects yet</h2>
          <p className="mx-auto max-w-md text-sm text-muted">
            A project holds a board of tasks. Create one, then describe your first task in a sentence and the AI
            drafts it for you.
          </p>
          <Button id={NEW_BUTTON_ID} size="lg" onClick={() => setFormOpen(true)}>
            New project
          </Button>
        </div>
      )}

      {projects && projects.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {shown.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} stats={statsById.get(p.id)} currentUserId={user?.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
