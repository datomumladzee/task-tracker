// The intake rules that are not about display, kept apart from the
// components so they can be read in one place.

import type { DraftConfirm, Outcome, ParseResponse, TaskPriority, TaskStatus } from "./types";

// The fields the user may edit on the draft card. Only ones the user actually
// changed end up in the confirm body; the rest keep the stored draft's value.
export type DraftEdits = {
  title?: string;
  description?: string | null;
  due_date?: string | null;
  priority?: TaskPriority;
  status?: TaskStatus;
};

// The user's answers to the resolver. undefined means "not answered, keep
// what the draft says". For the assignee, null is an answer: "nobody".
export type Answers = {
  projectId?: number;
  assigneeId?: number | null;
};

// The browser's IANA timezone, e.g. "Asia/Tbilisi", so "friday" means the
// user's Friday. null if the browser will not say; the backend then uses UTC.
export function browserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

// The project the task will go into: the user's pick, else the resolver's.
export function chosenProjectId(parsed: ParseResponse, answers: Answers): number | null {
  if (answers.projectId !== undefined) return answers.projectId;
  return parsed.project.outcome === "resolved" ? parsed.project.id : null;
}

// The same rule as ResolvedDraft.ready in backend/app/intake/schemas.py,
// applied after the user's answers: a project is required, an assignee is
// optional.
//
// "waiting" means the assignee could not be checked because the project was
// unknown. Once the user picks a project, confirm resolves the assignee
// against it on the server. If that turns out ambiguous, confirm answers 422
// with the question, and the card shows it.
export function isReady(parsed: ParseResponse, assignee: Outcome, answers: Answers): boolean {
  if (chosenProjectId(parsed, answers) === null) return false;
  if (answers.assigneeId !== undefined) return true;
  return assignee === "resolved" || assignee === "not_given" || (assignee === "waiting" && answers.projectId !== undefined);
}

// Only what changed. Sending untouched fields would work too, but it would
// hide which parts the user corrected, and the backend treats a sent null as
// "clear this", so sending everything risks clearing by accident.
export function confirmBody(edits: DraftEdits, answers: Answers): DraftConfirm {
  const body: DraftConfirm = { ...edits };
  if (answers.projectId !== undefined) body.project_id = answers.projectId;
  if (answers.assigneeId !== undefined) body.assignee_id = answers.assigneeId;
  return body;
}
