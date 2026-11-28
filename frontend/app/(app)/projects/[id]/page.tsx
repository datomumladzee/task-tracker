"use client";

// One project: the intake box, the plain add form, the board, and the task
// panel. The page owns the task list; the pieces below report back what
// changed, so the board updates without a refresh.

import { Breadcrumb } from "@/components/Breadcrumb";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Board } from "@/components/board/Board";
import { NewTaskForm } from "@/components/board/NewTaskForm";
import { DeleteProjectPanel } from "@/components/projects/DeleteProjectPanel";
import { EditProjectForm } from "@/components/projects/EditProjectForm";
import { MemberStack } from "@/components/projects/MemberStack";
import { PROJECT_ACTIONS_BUTTON_ID, ProjectActionsMenu } from "@/components/projects/ProjectActionsMenu";
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
  // The admin panels under the title row. One at a time.
  const [panel, setPanel] = useState<"edit" | "delete" | null>(null);

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

  // Close an admin panel and give focus back to the "⋯" button it was
  // opened from, so a keyboard user is not dropped at the top of the page.
  function closePanel() {
    setPanel(null);
    requestAnimationFrame(() => document.getElementById(PROJECT_ACTIONS_BUTTON_ID)?.focus());
  }

  // PATCH answers without the caller's role, so merge the new name and
  // description into the project we already have instead of replacing it.
  function saved(changes: { name: string; description: string | null }) {
    setProjects((ps) => ps.map((p) => (p.id === projectId ? { ...p, ...changes } : p)));
    closePanel();
  }

  if (error) {
    // 404 covers both "no such project" and "not a member", on purpose.
    return (
      <div className="space-y-3">
        <ErrorText message={error} />
        <Link href="/projects" className="text-sm underline">Back to projects</Link>
      </div>
    );
  }
  if (!tasks || !project || !role) return <p className="text-sm text-muted">Loading board...</p>;

  const open = tasks.find((t) => t.id === openId) ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {/* Takes the room the buttons leave, at least 16rem before they wrap
            below it, so a long name is cut instead of pushing them off. */}
        <div className="min-w-0 flex-[1_1_16rem]">
          <Breadcrumb trail={[{ label: "Projects", href: "/projects" }]} current={project.name} badge={<RoleBadge role={role} />} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <MemberStack projectId={projectId} members={members} />
          {/* Edit and delete share one admin rule today; the menu shows if
              either is allowed and each item checks its own. */}
          {(can.editProject(role) || can.deleteProject(role)) && (
            <ProjectActionsMenu
              onEdit={can.editProject(role) ? () => setPanel("edit") : undefined}
              onDelete={can.deleteProject(role) ? () => setPanel("delete") : undefined}
            />
          )}
        </div>
      </div>

      {panel === "edit" && <EditProjectForm project={project} onSaved={saved} onCancel={closePanel} />}
      {panel === "delete" && (
        <DeleteProjectPanel project={project} taskCount={tasks.length} memberCount={members.length} onCancel={closePanel} />
      )}

      {can.useIntake(role) && <IntakeBox projects={projects} currentProjectId={projectId} onCreated={upsert} />}
      {can.createTask(role) && <NewTaskForm projectId={projectId} onCreated={upsert} />}
      {role === "viewer" && (
        <p className="rounded bg-page px-3 py-2 text-sm text-muted">
          You can view this project. Ask an admin for the standard role to add or change tasks.
        </p>
      )}
      {tasks.length === 0 && can.createTask(role) && (
        <p className="text-sm text-muted">No tasks yet. Describe one above, or add one by title.</p>
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
