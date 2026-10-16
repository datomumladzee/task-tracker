"use client";

// One project: the intake box, the plain add form, and the board.
// The page owns the task list; the pieces below report back what changed.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Board } from "@/components/board/Board";
import { NewTaskForm } from "@/components/board/NewTaskForm";
import { IntakeBox } from "@/components/intake/IntakeBox";
import { RoleBadge } from "@/components/RoleBadge";
import { ErrorText } from "@/components/ui/ErrorText";
import { listProjects, listTasks } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import type { Project, Task } from "@/lib/types";

export default function ProjectPage() {
  const projectId = Number(useParams<{ id: string }>().id);

  // Decision: the project comes from the list endpoint, not GET
  // /projects/{id}, because only the list includes the caller's role. The
  // list is also what the intake box offers when it needs a project picked.
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listProjects(), listTasks(projectId)])
      .then(([p, t]) => {
        setProjects(p);
        setTasks(t);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [projectId]);

  const project = projects.find((p) => p.id === projectId);

  // Replace or add one task in the list. Used after a create, a move, and an
  // intake confirm. A task for another project is ignored here: the intake
  // box can create tasks anywhere and says where it put them.
  const upsert = useCallback(
    (task: Task) => {
      if (task.project_id !== projectId) return;
      setTasks((current) => [...(current ?? []).filter((t) => t.id !== task.id), task]);
    },
    [projectId],
  );

  if (error) {
    // 404 covers both "no such project" and "not a member", on purpose.
    return (
      <div className="space-y-3">
        <ErrorText message={error} />
        <Link href="/projects" className="text-sm underline">Back to projects</Link>
      </div>
    );
  }
  if (!tasks || !project) return <p className="text-sm text-zinc-500">Loading...</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900">Projects</Link>
        <span className="text-zinc-400">/</span>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <RoleBadge role={project.role} />
      </div>
      <IntakeBox projects={projects} currentProjectId={projectId} onCreated={upsert} />
      <NewTaskForm projectId={projectId} onCreated={upsert} />
      <Board tasks={tasks} onMoved={upsert} />
    </div>
  );
}
