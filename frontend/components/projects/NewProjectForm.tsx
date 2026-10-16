"use client";

// Create a project. Any logged-in user may, and becomes its admin.

import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Input } from "../ui/Input";
import { createProject } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";

export function NewProjectForm({ onCreated }: { onCreated: () => void }) {
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
      setName("");
      setDescription("");
      // Reload the list rather than inserting the reply: the reply is a
      // ProjectRead with no role, and the list needs one.
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="font-semibold">New project</h2>
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={200} required />
      <Input label="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <ErrorText message={error} />
      <Button type="submit" disabled={busy || !name.trim()}>{busy ? "Creating..." : "Create project"}</Button>
    </form>
  );
}
