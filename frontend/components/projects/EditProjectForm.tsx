"use client";

// Rename a project or change its description. Admin only; the page decides
// whether to show it.
//
// Sends only what changed, so saving an untouched form is not offered. An
// emptied description is sent as null, which clears it. Escape cancels.

import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Input } from "../ui/Input";
import { updateProject } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import type { Project } from "@/lib/types";

type Props = {
  project: Project;
  onSaved: (changes: { name: string; description: string | null }) => void;
  onCancel: () => void;
};

export function EditProjectForm({ project, onSaved, onCancel }: Props) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Compared the way the backend will store them: the name trimmed, an empty
  // description as no description.
  const newName = name.trim();
  const newDescription = description.trim() || null;
  const body: { name?: string; description?: string | null } = {};
  if (newName !== project.name) body.name = newName;
  if (newDescription !== project.description) body.description = newDescription;
  const changed = Object.keys(body).length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const saved = await updateProject(project.id, body);
      onSaved({ name: saved.name, description: saved.description });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) onCancel();
      }}
      aria-labelledby="edit-project-title"
      className="space-y-5 rounded-xl border border-line bg-card p-5 shadow-sm"
    >
      <h2 id="edit-project-title" className="font-brand text-lg font-semibold text-ink">Edit project</h2>
      <div className="grid gap-5 md:grid-cols-2">
        <Input label="Name" size="lg" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} autoFocus required />
        <Input
          label="Description (optional)"
          size="lg"
          placeholder="What this project is for"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ErrorText message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={busy || !newName || !changed}>
          {busy ? "Saving..." : "Save changes"}
        </Button>
        <Button type="button" size="lg" variant="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
