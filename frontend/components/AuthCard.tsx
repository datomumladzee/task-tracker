// The centred box the login and register pages sit in.

import { HealthBadge } from "./HealthBadge";

export function AuthCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">{title}</h1>
          <HealthBadge />
        </div>
        {children}
      </div>
    </main>
  );
}
