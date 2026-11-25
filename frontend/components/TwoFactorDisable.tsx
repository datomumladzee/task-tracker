"use client";

// Turning 2FA off, from Settings. Closed it is one red-outline button; open
// it asks for the password and a current code, which the backend requires
// both of (a signed-in session alone must not be able to remove the second
// factor).
//
// A wrong answer clears only the code: the backend says "Wrong password or
// code" without saying which, and retyping the password every time would
// punish the usual case, a code that ran out while typing.

import { useState } from "react";
import { Button } from "./ui/Button";
import { ErrorText } from "./ui/ErrorText";
import { Input } from "./ui/Input";
import { totpDisable } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import type { User } from "@/lib/types";

const OPEN_BUTTON_ID = "turn-off-2fa-button";
const CODE_ID = "turn-off-2fa-code";

export function TwoFactorDisable({ onDisabled }: { onDisabled: (user: User) => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function close() {
    setOpen(false);
    setPassword("");
    setCode("");
    setError(null);
    // Back to the button that opened the form, for keyboard users.
    requestAnimationFrame(() => document.getElementById(OPEN_BUTTON_ID)?.focus());
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDisabled(await totpDisable({ password, code }));
    } catch (err) {
      setError(errorMessage(err));
      setCode("");
      setBusy(false);
      // Clearing the code disables the submit button, which had focus, and a
      // disabled button drops it. Put focus where the next keystroke goes,
      // so Escape and typing keep working.
      requestAnimationFrame(() => document.getElementById(CODE_ID)?.focus());
    }
  }

  if (!open) {
    return (
      <Button id={OPEN_BUTTON_ID} variant="danger" onClick={() => setOpen(true)}>
        Turn off two-factor authentication
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !busy) close();
      }}
      aria-labelledby="turn-off-2fa-title"
      className="max-w-md space-y-4 rounded-xl border border-danger/30 bg-danger-bg p-5"
    >
      <div className="space-y-1">
        <h3 id="turn-off-2fa-title" className="font-semibold text-danger">Turn off two-factor authentication</h3>
        <p className="text-sm text-ink">
          Signing in will need only your password again. Enter your password and a code from your authenticator app
          to confirm.
        </p>
      </div>
      <Input
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        autoFocus
        required
      />
      <Input
        id={CODE_ID}
        label="Code"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        required
      />
      <ErrorText message={error} />
      <div className="flex gap-2">
        {/* Solid red only here, where it means "this really happens now". */}
        <button
          type="submit"
          disabled={busy || !password || code.length !== 6}
          className="rounded border border-transparent bg-danger px-3 py-1.5 text-sm font-medium text-white hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Turning off..." : "Turn off"}
        </button>
        <Button type="button" variant="quiet" onClick={close} disabled={busy}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
