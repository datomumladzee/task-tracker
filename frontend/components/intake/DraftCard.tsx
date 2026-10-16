"use client";

// The draft the model proposed, before it is a task. The user can fix any
// field and must answer the resolver's questions; Confirm stays off until the
// draft is ready. Nothing is saved as a task until Confirm succeeds.

import { useEffect, useState } from "react";
import { AssigneeChoice } from "./AssigneeChoice";
import { ProjectChoice } from "./ProjectChoice";
import { UnsureBanner } from "./UnsureBanner";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { ApiError } from "@/lib/api";
import { confirmDraft, listMembers } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { chosenProjectId, confirmBody, isReady, type Answers, type DraftEdits } from "@/lib/intake";
import {
  PRIORITIES,
  STATUSES,
  type Candidate,
  type Member,
  type ParseResponse,
  type Project,
  type Resolution,
  type Task,
} from "@/lib/types";

type Props = {
  parsed: ParseResponse;
  projects: Project[];
  onCreated: (task: Task) => void;
  // Parse the same sentence again, after the draft expired.
  onReparse: (text: string) => void;
  onDiscard: () => void;
};

// A confirm failure that needs more than a message: an expired draft offers
// to parse again, a used one can only be dismissed.
type Failure = { message: string; kind: "expired" | "used" | "other" };

const fieldClass = "w-full rounded border border-zinc-300 bg-white px-2 py-1.5";

// Each field also gets an aria-label. A <select> inside its <label> would
// otherwise be named by the label plus the text of every option in it.

export function DraftCard({ parsed, projects, onCreated, onReparse, onDiscard }: Props) {
  const { draft } = parsed;
  const [edits, setEdits] = useState<DraftEdits>({});
  const [answers, setAnswers] = useState<Answers>({});
  // Copies of the resolver's answers. Confirm can send back a fresh question
  // (422), which replaces them.
  const [projectRes, setProjectRes] = useState<Resolution>(parsed.project);
  const [assigneeRes, setAssigneeRes] = useState<Resolution>(parsed.assignee);
  const [members, setMembers] = useState<{ projectId: number; list: Member[] } | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [busy, setBusy] = useState(false);

  const projectId = chosenProjectId({ ...parsed, project: projectRes }, answers);
  const ready = isReady({ ...parsed, project: projectRes }, assigneeRes.outcome, answers);

  // Members of the chosen project, for the assignee dropdown. Keyed by
  // project id, so a reply for a project the user already left is ignored.
  useEffect(() => {
    if (projectId === null) return;
    let live = true;
    listMembers(projectId)
      .then((list) => live && setMembers({ projectId, list }))
      .catch(() => live && setMembers({ projectId, list: [] }));
    return () => {
      live = false;
    };
  }, [projectId]);
  const memberList = projectId !== null && members?.projectId === projectId ? members.list : null;

  // What is still open, for the banner. An answer closes a question even
  // though the stored resolution keeps its original outcome.
  const projectOpen = projectId === null ? projectRes.outcome : null;
  const assigneeOpen =
    answers.assigneeId === undefined && ["ambiguous", "unknown"].includes(assigneeRes.outcome)
      ? assigneeRes.outcome
      : assigneeRes.outcome === "waiting" && projectId === null
        ? "waiting"
        : null;

  // Record an edit only when it differs from the draft, so the confirm body
  // carries exactly what the user changed.
  function edit<K extends keyof DraftEdits>(key: K, value: DraftEdits[K], original: unknown) {
    setEdits((current) => {
      const next = { ...current };
      if (value === original || value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  function pickProject(id: number) {
    setAnswers((a) => ({ projectId: id, assigneeId: a.assigneeId === null ? null : undefined }));
    // A person picked in another project may not be in this one, and the
    // server re-checks the assignee's words against the new project anyway.
    if (id !== parsed.project.id) {
      setAssigneeRes({
        outcome: draft.assignee_ref ? "waiting" : "not_given",
        ref: draft.assignee_ref,
        id: null,
        candidates: [],
        question: null,
      });
    } else {
      setAssigneeRes(parsed.assignee);
    }
  }

  async function confirm() {
    setBusy(true);
    setFailure(null);
    try {
      onCreated(await confirmDraft(parsed.draft_id, confirmBody(edits, answers)));
    } catch (e) {
      setFailure(describeFailure(e));
    } finally {
      setBusy(false);
    }
  }

  // Maps the confirm endpoint's documented failures to what the card shows.
  function describeFailure(e: unknown): Failure {
    if (!(e instanceof ApiError)) return { message: errorMessage(e), kind: "other" };
    if (e.status === 410) return { message: "This draft expired after 30 minutes.", kind: "expired" };
    if (e.status === 409) return { message: "This draft was already turned into a task.", kind: "used" };
    if (e.status === 403) {
      return { message: "You can only view that project, so you cannot add tasks to it. Pick another project.", kind: "other" };
    }
    if (e.status === 422 && e.detail && typeof e.detail === "object" && "field" in e.detail) {
      // The server re-resolved and still needs an answer: show its question.
      const d = e.detail as { field: string; question: string | null; candidates: Candidate[] };
      const fresh: Resolution = {
        outcome: d.candidates.length > 1 ? "ambiguous" : "unknown",
        ref: d.field === "project" ? draft.project_ref : draft.assignee_ref,
        id: null,
        candidates: d.candidates,
        question: d.question,
      };
      if (d.field === "project") {
        setProjectRes(fresh);
        setAnswers((a) => ({ ...a, projectId: undefined }));
      } else {
        setAssigneeRes(fresh);
        setAnswers((a) => ({ ...a, assigneeId: undefined }));
      }
      return { message: errorMessage(e), kind: "other" };
    }
    return { message: errorMessage(e), kind: "other" };
  }

  const title = edits.title ?? draft.title;
  const description = edits.description !== undefined ? edits.description : draft.description;
  const dueDate = edits.due_date !== undefined ? edits.due_date : draft.due_date;
  const priority = edits.priority ?? draft.priority;
  const status = edits.status ?? draft.status;

  return (
    <div className="space-y-4 rounded-lg border border-zinc-300 bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">Draft</h3>
        <p className="truncate text-xs text-zinc-500" title={parsed.text}>from &ldquo;{parsed.text}&rdquo;</p>
      </div>

      <UnsureBanner project={projectOpen} assignee={assigneeOpen} />

      <div className="grid gap-3 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-zinc-700">Title</span>
          <input
            aria-label="Title"
            value={title}
            maxLength={200}
            onChange={(e) => edit("title", e.target.value, draft.title)}
            className={fieldClass}
          />
        </label>

        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block font-medium text-zinc-700">Description</span>
          <textarea
            aria-label="Description"
            value={description ?? ""}
            rows={2}
            // Empty means no description: null, which confirm accepts.
            onChange={(e) => edit("description", e.target.value || null, draft.description)}
            className={fieldClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Due date</span>
          <input
            aria-label="Due date"
            type="date"
            value={dueDate ?? ""}
            onChange={(e) => edit("due_date", e.target.value || null, draft.due_date)}
            className={fieldClass}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Priority</span>
          <select
            aria-label="Priority"
            value={priority ?? ""}
            // "" is the draft's own null. Confirm rejects an explicit null
            // priority, so choosing it removes the edit instead.
            onChange={(e) => edit("priority", (e.target.value || undefined) as DraftEdits["priority"], draft.priority)}
            className={fieldClass}
          >
            {draft.priority === null && <option value="">Not said (medium)</option>}
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </label>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Status</span>
          <select
            aria-label="Status"
            value={status ?? ""}
            onChange={(e) => edit("status", (e.target.value || undefined) as DraftEdits["status"], draft.status)}
            className={fieldClass}
          >
            {draft.status === null && <option value="">Not said (to do)</option>}
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>

        <ProjectChoice resolution={projectRes} projects={projects} value={projectId} onPick={pickProject} />
        <AssigneeChoice
          resolution={assigneeRes}
          members={memberList}
          projectChosen={projectId !== null}
          answer={answers.assigneeId}
          onPick={(id) => setAnswers((a) => ({ ...a, assigneeId: id }))}
        />
      </div>

      {failure && (
        <div className="space-y-2">
          <ErrorText message={failure.message} />
          {failure.kind === "expired" && (
            <Button variant="secondary" onClick={() => onReparse(parsed.text)}>Parse the sentence again</Button>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button onClick={confirm} disabled={!ready || busy || failure?.kind === "expired" || failure?.kind === "used"}>
          {busy ? "Creating..." : "Confirm and create task"}
        </Button>
        <Button variant="secondary" onClick={onDiscard} disabled={busy}>Discard</Button>
      </div>
      {!ready && <p className="text-xs text-zinc-500">Answer the questions above to enable Confirm.</p>}
    </div>
  );
}
