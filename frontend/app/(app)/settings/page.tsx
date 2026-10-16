"use client";

import { TwoFactorSetup } from "@/components/TwoFactorSetup";
import { useAuth } from "@/lib/auth";

export default function SettingsPage() {
  const { user, updateUser } = useAuth();
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="text-sm text-zinc-600">Signed in as {user?.email}</p>
      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="font-semibold">Two-factor authentication</h2>
        <TwoFactorSetup enabled={user?.totp_enabled ?? false} onVerified={updateUser} />
      </section>
    </div>
  );
}
