// One typed function per backend endpoint the frontend uses. Paths, methods
// and body shapes are taken from backend/app/*/router.py. Every call goes
// through request() in lib/api.ts.

import { request } from "./api";
import type {
  DraftConfirm,
  LoginResponse,
  Member,
  ParseResponse,
  Project,
  Task,
  TaskCreate,
  TaskStatus,
  TotpSetupResponse,
  User,
} from "./types";

export const health = () => request<{ status: string }>("GET", "/health", { auth: false });

// --- auth -------------------------------------------------------------------

export const register = (body: { email: string; password: string; full_name: string }) =>
  request<User>("POST", "/auth/register", { body, auth: false });

export const login = (body: { email: string; password: string }) =>
  request<LoginResponse>("POST", "/auth/login", { body, auth: false });

// Step two of login. The pending token travels in the body, not the header.
export const totpLogin = (body: { pending_token: string; code: string }) =>
  request<LoginResponse>("POST", "/auth/2fa/login", { body, auth: false });

export const totpSetup = () => request<TotpSetupResponse>("POST", "/auth/2fa/setup");

// Returns the updated user, with totp_enabled now true.
export const totpVerify = (code: string) =>
  request<User>("POST", "/auth/2fa/verify", { body: { code } });

export const me = () => request<User>("GET", "/users/me");

// --- projects ---------------------------------------------------------------

export const listProjects = () => request<Project[]>("GET", "/projects");

// Returns ProjectRead, which has no role. The creator is always its admin.
export const createProject = (body: { name: string; description?: string | null }) =>
  request<Omit<Project, "role">>("POST", "/projects", { body });

export const listMembers = (projectId: number) =>
  request<Member[]>("GET", `/projects/${projectId}/members`);

// --- tasks ------------------------------------------------------------------

// Already sorted by column, then position, by the backend.
export const listTasks = (projectId: number) =>
  request<Task[]>("GET", `/projects/${projectId}/tasks`);

export const createTask = (projectId: number, body: TaskCreate) =>
  request<Task>("POST", `/projects/${projectId}/tasks`, { body });

// Status only changes through /move. With no before/after anchor the task
// goes to the bottom of the new column, which is what a dropdown wants.
export const moveTask = (projectId: number, taskId: number, status: TaskStatus) =>
  request<Task>("POST", `/projects/${projectId}/tasks/${taskId}/move`, { body: { status } });

// --- intake -----------------------------------------------------------------

export const parseIntake = (text: string, timezone: string | null) =>
  request<ParseResponse>("POST", "/intake/parse", { body: { text, timezone } });

export const confirmDraft = (draftId: number, body: DraftConfirm) =>
  request<Task>("POST", `/intake/drafts/${draftId}/confirm`, { body });
