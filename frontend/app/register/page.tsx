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
import { checkEmail, checkName, checkNewPassword, useFieldErrors } from "@/lib/validation";

export default function RegisterPage() {
  const { signIn } = useAuth();
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { errors, validateAll, recheck } = useFieldErrors<"fullName" | "email" | "password">();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Our checks first; nothing is sent while a field is wrong.
    const checks = { fullName: checkName(fullName), email: checkEmail(email), password: checkNewPassword(password) };
    if (!validateAll(e.currentTarget, checks)) return;
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
    <AuthCard title="Sign up">
      <form onSubmit={submit} noValidate className="space-y-5">
        <Input
          tone="dark"
          label="Full name"
          name="fullName"
          placeholder="Your full name"
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value);
            recheck("fullName", checkName(e.target.value));
          }}
          error={errors.fullName}
          autoComplete="name"
          required
        />
        <Input
          tone="dark"
          label="Email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            recheck("email", checkEmail(e.target.value));
          }}
          error={errors.email}
          autoComplete="email"
          required
        />
        {/* 8 to 128, the same rule as UserCreate. maxLength stays: it stops
            typing at 128, which noValidate does not turn off. */}
        <Input
          tone="dark"
          label="Password"
          name="password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            recheck("password", checkNewPassword(e.target.value));
          }}
          error={errors.password}
          autoComplete="new-password"
          minLength={8}
          maxLength={128}
          required
        />
        <ErrorText message={error} tone="dark" />
        <Button type="submit" size="lg" tone="dark" disabled={busy} className="w-full">
          {busy ? "Signing up..." : "Sign up"}
        </Button>
        <p className="text-center text-sm text-muted-on-dark">
          Have an account? <Link href="/login" className="text-on-dark underline hover:text-white">Sign in</Link>
        </p>
      </form>
    </AuthCard>
  );
}
