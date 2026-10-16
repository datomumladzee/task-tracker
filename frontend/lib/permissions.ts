// Who may do what in a project, copied from the backend's checks so the UI
// never offers a button that can only end in a 403. The backend still checks
// every request; this file only decides what to show.
//
// Sources: require_project_role(...) on each route in
// backend/app/tasks/router.py and backend/app/projects/router.py, plus the
// in-route checks for comments and for removing a member.

import type { ProjectRole } from "./types";

const RANK: Record<ProjectRole, number> = { viewer: 1, standard: 2, admin: 3 };

function atLeast(role: ProjectRole | null | undefined, minimum: ProjectRole): boolean {
  return role != null && RANK[role] >= RANK[minimum];
}

export const can = {
  // POST /tasks, PATCH /tasks/{id}, POST /tasks/{id}/move: standard.
  createTask: (role?: ProjectRole | null) => atLeast(role, "standard"),
  editTask: (role?: ProjectRole | null) => atLeast(role, "standard"),
  moveTask: (role?: ProjectRole | null) => atLeast(role, "standard"),
  // DELETE /tasks/{id}: admin. Standard can edit a task but not delete it.
  deleteTask: (role?: ProjectRole | null) => atLeast(role, "admin"),

  // POST /comments: standard. Viewers read but do not write.
  comment: (role?: ProjectRole | null) => atLeast(role, "standard"),
  // DELETE /comments/{id}: the author (any role) or a project admin.
  deleteComment: (role: ProjectRole | null | undefined, isAuthor: boolean) =>
    role != null && (isAuthor || atLeast(role, "admin")),

  // Intake confirm creates a task, so it needs standard in that project.
  useIntake: (role?: ProjectRole | null) => atLeast(role, "standard"),

  // POST and PATCH /members, and DELETE of someone else: admin.
  manageMembers: (role?: ProjectRole | null) => atLeast(role, "admin"),
  // DELETE /members/{your own id}: any member may leave.
  leave: (role?: ProjectRole | null) => role != null,
};
