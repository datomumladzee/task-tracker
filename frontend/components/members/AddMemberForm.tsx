"use client";

// Admin only: add an existing account to the project by email.
// The backend answers 404 when no active account has that email, and 409
// when the person is already in; both messages are shown as they come.

import { useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { Input } from "../ui/Input";
import { addMember } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { ROLES, type Member, type ProjectRole } from "@/lib/types";

export function AddMemberForm({ projectId, onAdded }: { projectId: number; onAdded: (m: Member) => void }) {
  const [email, setEmail] = useState("");
  // standard is the backend's default too (MemberAdd.role).
  const [role, setRole] = useState<ProjectRole>("standard");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onAdded(await addMember(projectId, { email, role }));
      setEmail("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="font-semibold">Add a person</h2>
      <p className="text-xs text-zinc-500">They need an account already. Adding does not send an invite.</p>
      <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Role</span>
        <select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as ProjectRole)} className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5">
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </label>
      <ErrorText message={error} />
      <Button type="submit" disabled={busy || !email.trim()}>{busy ? "Adding..." : "Add member"}</Button>
    </form>
  );
}
