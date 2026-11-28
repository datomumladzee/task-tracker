"use client";

// Create a project. Any logged-in user may, and becomes its admin.
// Opened from the "New project" button; Cancel or Escape closes it.

import { LIMITS } from "@/lib/limits";
import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Input } from "../ui/Input";
import { createProject } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";

type Props = {
  onCreated: () => void;
  onCancel: () => void;
};

export function NewProjectForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await createProject({ name, description: description.trim() || null });
      // Reload the list rather than inserting the reply, so the order and
      // every role come from the one endpoint the page already trusts.
      onCreated();
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
      aria-labelledby="new-project-title"
      className="space-y-5 rounded-xl border border-line bg-card p-5 shadow-sm"
    >
      <h2 id="new-project-title" className="font-brand text-lg font-semibold text-ink">New project</h2>
      <div className="grid gap-5 md:grid-cols-2">
        {/* autoFocus: the button that opened this form is gone, so focus
            has to land somewhere useful. */}
        <Input
          label="Name"
          size="lg"
          placeholder="Website relaunch"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={LIMITS.projectName}
          autoFocus
          required
        />
        <Input
          label="Description (optional)"
          maxLength={LIMITS.projectDescription}
          size="lg"
          placeholder="What this project is for"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      <ErrorText message={error} />
      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={busy || !name.trim()}>
          {busy ? "Creating..." : "Create project"}
        </Button>
        <Button type="button" size="lg" variant="quiet" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
