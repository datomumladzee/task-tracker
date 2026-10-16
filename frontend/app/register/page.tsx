"use client";

// Create an account, then log straight in. A new account has 2FA off, so the
// login reply always carries an access token here.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthCard } from "@/components/AuthCard";
import { Button } from "@/components/ui/Button";
import { ErrorText } from "@/components/ui/ErrorText";
import { Input } from "@/components/ui/Input";
import { useAuth } from "@/lib/auth";
import { login, register } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";

export default function RegisterPage() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register({ email, password, full_name: fullName });
      const reply = await login({ email, password });
      if (reply.access_token) {
        await signIn(reply.access_token);
        router.push("/projects");
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthCard title="Create an account">
      <form onSubmit={submit} className="space-y-3">
        <Input label="Full name" value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        {/* 8 to 128, the same rule as UserCreate. The backend still checks. */}
        <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} maxLength={128} required />
        <ErrorText message={error} />
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Creating..." : "Create account"}
        </Button>
        <p className="text-center text-sm text-zinc-600">
          Have an account? <Link href="/login" className="underline">Log in</Link>
        </p>
      </form>
    </AuthCard>
  );
}
