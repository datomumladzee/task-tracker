// The backend's response and request shapes, copied by hand from its Pydantic
// schemas (backend/app/*/schemas.py). Kept in one file so a schema change has
// one place to land here. Dates arrive as ISO strings, not Date objects.

export type TaskStatus = "todo" | "in_progress" | "in_review" | "done";
export type TaskPriority = "low" | "medium" | "high";
export type ProjectRole = "admin" | "standard" | "viewer";

// users/schemas.py UserRead: your own account only. Other people arrive as
// UserSummary, which says nothing about their 2FA.
export type User = {
  id: number;
  email: string;
  full_name: string;
  role: "admin" | "member";
  is_active: boolean;
  created_at: string;
  totp_enabled: boolean;
};

// users/schemas.py UserSummary, nested inside tasks and members.
export type UserSummary = { id: number; email: string; full_name: string };

// users/schemas.py LoginResponse. One shape for both login steps.
export type LoginResponse = {
  mfa_required: boolean;
  access_token: string | null;
  pending_token: string | null;
  token_type: string;
};

export type TotpSetupResponse = { provisioning_uri: string; secret: string };

// projects/schemas.py ProjectListItem: a project plus the caller's role.
export type Project = {
  id: number;
  name: string;
  description: string | null;
  created_by_id: number | null;
  created_at: string;
  role: ProjectRole;
};

export type Member = { user: UserSummary; role: ProjectRole; created_at: string };

// tasks/schemas.py TaskRead.
export type Task = {
  id: number;
  project_id: number;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string | null;
  assignee: UserSummary | null;
  created_by_id: number | null;
  position: number;
  created_at: string;
  updated_at: string;
};

export type TaskCreate = {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_date?: string | null;
  assignee_id?: number | null;
};

// intake/schemas.py. The model's words, never ids.
export type TaskDraft = {
  title: string;
  description: string | null;
  due_date: string | null;
  priority: TaskPriority | null;
  status: TaskStatus | null;
  project_ref: string | null;
  assignee_ref: string | null;
};

export type Outcome = "resolved" | "ambiguous" | "unknown" | "not_given" | "waiting";
export type Candidate = { id: number; label: string };

export type Resolution = {
  outcome: Outcome;
  ref: string | null;
  id: number | null;
  candidates: Candidate[];
  question: string | null;
};

export type ParseResponse = {
  draft_id: number;
  text: string;
  draft: TaskDraft;
  project: Resolution;
  assignee: Resolution;
  ready: boolean;
  expires_at: string;
};

// intake/schemas.py DraftConfirm. Every field optional: only what is sent
// changes. project_id, title, priority and status must not be sent as null.
export type DraftConfirm = {
  project_id?: number;
  assignee_id?: number | null;
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
};

export const STATUSES: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "in_review", label: "In review" },
  { value: "done", label: "Done" },
];

export const PRIORITIES: TaskPriority[] = ["low", "medium", "high"];
