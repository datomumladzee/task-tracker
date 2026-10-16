"use client";

// One project: the intake box, the plain add form, the board, and the task
// panel. The page owns the task list; the pieces below report back what
// changed, so the board updates without a refresh.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Board } from "@/components/board/Board";
import { NewTaskForm } from "@/components/board/NewTaskForm";
import { IntakeBox } from "@/components/intake/IntakeBox";
import { RoleBadge } from "@/components/RoleBadge";
import { TaskPanel } from "@/components/task/TaskPanel";
import { ErrorText } from "@/components/ui/ErrorText";
import { useAuth } from "@/lib/auth";
import { listMembers, listProjects, listTasks } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { can } from "@/lib/permissions";
import type { Member, Project, Task } from "@/lib/types";

export default function ProjectPage() {
  const projectId = Number(useParams<{ id: string }>().id);
  const { user } = useAuth();

  // The project comes from the list endpoint, not GET /projects/{id},
  // because only the list includes the caller's role. The list is also what
  // the intake box offers when it needs a project picked.
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  // For the assignee dropdown in the task panel.
  const [members, setMembers] = useState<Member[]>([]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([listProjects(), listTasks(projectId), listMembers(projectId)])
      .then(([p, t, m]) => {
        setProjects(p);
        setTasks(t);
        setMembers(m);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [projectId]);

  const project = projects.find((p) => p.id === projectId);
  const role = project?.role ?? null;

  // Replace or add one task in the list. Used after a create, a move, an
  // edit and an intake confirm. A task for another project is ignored: the
  // intake box can create tasks anywhere and says where it put them.
  const upsert = useCallback(
    (task: Task) => {
      if (task.project_id !== projectId) return;
      setTasks((current) => [...(current ?? []).filter((t) => t.id !== task.id), task]);
    },
    [projectId],
  );

  const remove = useCallback((id: number) => {
    setTasks((current) => (current ?? []).filter((t) => t.id !== id));
    setOpenId(null);
  }, []);

  const close = useCallback(() => setOpenId(null), []);

  if (error) {
    // 404 covers both "no such project" and "not a member", on purpose.
    return (
      <div className="space-y-3">
        <ErrorText message={error} />
        <Link href="/projects" className="text-sm underline">Back to projects</Link>
      </div>
    );
  }
  if (!tasks || !project || !role) return <p className="text-sm text-zinc-500">Loading board...</p>;

  const open = tasks.find((t) => t.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900">Projects</Link>
        <span className="text-zinc-400">/</span>
        <h1 className="text-xl font-semibold">{project.name}</h1>
        <RoleBadge role={role} />
        <Link href={`/projects/${projectId}/members`} className="ml-auto text-sm underline">
          Members ({members.length})
        </Link>
      </div>

      {can.useIntake(role) && <IntakeBox projects={projects} currentProjectId={projectId} onCreated={upsert} />}
      {can.createTask(role) && <NewTaskForm projectId={projectId} onCreated={upsert} />}
      {role === "viewer" && (
        <p className="rounded bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
          You can view this project. Ask an admin for the standard role to add or change tasks.
        </p>
      )}
      {tasks.length === 0 && can.createTask(role) && (
        <p className="text-sm text-zinc-500">No tasks yet. Describe one above, or add one by title.</p>
      )}

      <Board tasks={tasks} canMove={can.moveTask(role)} onMoved={upsert} onOpen={(t) => setOpenId(t.id)} />

      {open && user && (
        <TaskPanel
          task={open}
          role={role}
          members={members}
          currentUserId={user.id}
          onSaved={upsert}
          onDeleted={remove}
          onClose={close}
        />
      )}
    </div>
  );
}
