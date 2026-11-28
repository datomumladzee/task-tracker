"use client";

// Delete a project. Admin only; the page decides whether to show it.
//
// The delete takes every task and comment with it, for every member, and
// cannot be undone, so a second click is not enough: the project's name has
// to be typed first, the way GitHub guards deleting a repository. Afterwards
// the user lands on the projects list, where the project is gone.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Input } from "../ui/Input";
import { deleteProject } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import type { Project } from "@/lib/types";

type Props = {
  project: Project;
  taskCount: number;
  memberCount: number;
  onCancel: () => void;
};

export function DeleteProjectPanel({ project, taskCount, memberCount, onCancel }: Props) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // "DELETE" in any case, spaces at the ends ignored. A fixed word instead of
  // the project's name, which can be 200 characters long.
  const confirmed = typed.trim().toUpperCase() === "DELETE";
  // The name is cut to about 60 characters here; the full name is in the
  // tooltip.
  const shortName = project.name.length > 60 ? `${project.name.slice(0, 60).trimEnd()}…` : project.name;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await deleteProject(project.id);
      router.push("/projects");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const tasks = `${taskCount} ${taskCount === 1 ? "task" : "tasks"}`;
  const people = memberCount === 1 ? "you" : `all ${memberCount} members`;

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
      aria-labelledby="delete-project-title"
      className="space-y-4 rounded-xl border border-danger/30 bg-danger-bg p-5"
    >
      <h2 id="delete-project-title" className="font-brand text-lg font-semibold text-danger">Delete this project</h2>
      <p className="text-sm text-ink">
        This deletes{" "}
        <strong title={project.name} className="break-words">
          {shortName}
        </strong>{" "}
        with its {tasks} and their comments, for {people}. It cannot be
        undone.
      </p>
      <Input
        label="Type DELETE to confirm"
        size="lg"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
        spellCheck={false}
        autoFocus
      />
      <ErrorText message={error} />
      <div className="flex gap-2">
        {/* Solid red only here, where it means "this really happens now". */}
        <button
          type="submit"
          disabled={!confirmed || busy}
          className="rounded border border-transparent bg-danger px-4 py-2.5 text-base font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Deleting..." : "Delete project"}
        </button>
        <Button type="button" size="lg" variant="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
