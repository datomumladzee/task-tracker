"use client";

// Turning 2FA on, in the backend's two steps:
//   1. /auth/2fa/setup   makes a secret and returns it, plus a QR payload
//   2. /auth/2fa/verify  takes the first code from the phone and switches 2FA on
// Until step 2 succeeds, 2FA stays off, so a failed scan cannot lock anyone out.
//
// The QR code is drawn here in the browser by qrcode.react. Sending the
// provisioning URI to an online QR service would hand the secret to a third
// party. The secret stays in component state and is never stored.

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Button } from "./ui/Button";
import { ErrorText } from "./ui/ErrorText";
import { Input } from "./ui/Input";
import { totpSetup, totpVerify } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import type { TotpSetupResponse, User } from "@/lib/types";

type Props = {
  // From the logged-in user. When true, setup is not offered at all: the
  // backend refuses to replace a working secret and would answer 409.
  enabled: boolean;
  // Called with the user verify returns, so the page shows 2FA as on.
  onVerified: (user: User) => void;
};

export function TwoFactorSetup({ enabled, onVerified }: Props) {
  const [setup, setSetup] = useState<TotpSetupResponse | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      setSetup(await totpSetup());
      setCode("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await totpVerify(code);
      setSetup(null);
      onVerified(user);
    } catch (err) {
      // A wrong code is a 400 with "Invalid code". It never logs anyone
      // out: lib/api.ts only does that for a 401 marked WWW-Authenticate.
      setError(errorMessage(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm">
        Status:
        {enabled ? (
          <span className="rounded bg-emerald-100 px-2 py-0.5 text-emerald-800">On</span>
        ) : (
          <span className="rounded bg-zinc-200 px-2 py-0.5 text-zinc-700">Off</span>
        )}
      </p>

      {enabled ? (
        <p className="text-sm text-zinc-600">
          Your next login will ask for a code from your authenticator app.
        </p>
      ) : (
        <>
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Running setup again before verifying replaces the secret. Any code from an earlier scan stops working, so
            delete that entry from your authenticator app and scan the new QR code.
          </p>

          {!setup && (
            <Button onClick={start} disabled={busy}>
              {busy ? "Starting..." : "Set up two-factor authentication"}
            </Button>
          )}

          {setup && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start gap-6">
                <div className="rounded border border-zinc-200 bg-white p-3">
                  <QRCodeSVG value={setup.provisioning_uri} size={180} />
                </div>
                <div className="space-y-2 text-sm">
                  <p>1. Scan the code with an authenticator app.</p>
                  <p>Or type this secret in by hand:</p>
                  <code className="block break-all rounded bg-zinc-100 px-2 py-1 font-mono">{setup.secret}</code>
                  <p>2. Enter the 6-digit code the app shows.</p>
                </div>
              </div>
              <form onSubmit={verify} className="flex max-w-xs items-end gap-2">
                <Input
                  label="Code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                />
                <Button type="submit" disabled={busy || code.length !== 6}>Verify</Button>
              </form>
              <Button variant="secondary" onClick={start} disabled={busy}>Start again with a new secret</Button>
            </div>
          )}
        </>
      )}

      <ErrorText message={error} />
    </div>
  );
}
