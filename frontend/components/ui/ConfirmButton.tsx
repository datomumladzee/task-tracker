"use client";

// A button that asks before it acts: the first click shows the question and
// a "Yes" button, only the second runs the action. Used for deleting a task,
// removing a member and leaving a project.
// Decision: inline, not window.confirm, which some browsers suppress and
// which cannot be styled or tested reliably.

import { useState } from "react";
import { Button } from "./Button";
import { ErrorText } from "./ErrorText";
import { errorMessage } from "@/lib/errors";

type Props = {
  label: string;
  question: string;
  yes: string;
  // Rejects with the backend's error, which is then shown here.
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  // Shown as a tooltip when disabled, saying why.
  disabledReason?: string;
};

export function ConfirmButton({ label, question, yes, onConfirm, disabled, disabledReason }: Props) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      setAsking(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!asking) {
    return (
      <div className="space-y-1">
        <Button
          variant="danger"
          onClick={() => setAsking(true)}
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
        >
          {label}
        </Button>
        <ErrorText message={error} />
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded border border-danger/30 bg-danger-bg p-3 text-sm">
      <p className="text-danger">{question}</p>
      <div className="flex gap-2">
        {/* Solid red only here, on the second click, where it means "this
            really happens now". */}
        <button type="button" onClick={go} disabled={busy} className="rounded bg-danger px-3 py-1.5 font-medium text-white hover:bg-danger/90 disabled:opacity-50">
          {busy ? "Working..." : yes}
        </button>
        <Button variant="quiet" onClick={() => setAsking(false)} disabled={busy}>Cancel</Button>
      </div>
      <ErrorText message={error} />
    </div>
  );
}
