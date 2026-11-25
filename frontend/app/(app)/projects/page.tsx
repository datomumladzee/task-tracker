"use client";

// Your projects as cards, with what the app already knows about each: your
// role, when it was made and by whom, and how its tasks stand.
//
// useProjectsWithTasks draws the cards from the projects list at once, then
// fills in each card's bar and counts as that project's tasks arrive.

import { useState } from "react";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { Overview } from "@/components/projects/Overview";
import { ProjectCard } from "@/components/projects/ProjectCard";
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
  const today = todayIso();

  function closeForm() {
    setFormOpen(false);
    // The button comes back when the form closes; put focus on it so a
    // keyboard user is not dropped at the top of the page.
    requestAnimationFrame(() => document.getElementById(NEW_BUTTON_ID)?.focus());
  }

  const adminCount = projects?.filter((p) => p.role === "admin").length ?? 0;

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
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-brand text-2xl font-semibold text-ink">Projects</h1>
          {projects && projects.length > 0 && (
            <p className="text-sm text-muted">
              {projects.length} {projects.length === 1 ? "project" : "projects"}
              {adminCount > 0 && ` · admin on ${adminCount}`}
            </p>
          )}
        </div>
        {!formOpen && projects && projects.length > 0 && (
          <Button id={NEW_BUTTON_ID} size="lg" onClick={() => setFormOpen(true)}>
            New project
          </Button>
        )}
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
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} stats={statsById.get(p.id)} currentUserId={user?.id} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
