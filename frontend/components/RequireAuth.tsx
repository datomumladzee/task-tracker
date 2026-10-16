"use client";

// Wraps pages that need a login. Logged out: send to /login. Still checking
// the stored token: show a placeholder rather than flashing the page.
//
// This is convenience, not security. The backend checks the token on every
// request, so skipping this wrapper would only show empty pages and 401s.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "out") router.replace("/login");
  }, [status, router]);

  if (status !== "in") return <p className="p-8 text-sm text-zinc-500">Loading...</p>;
  return <>{children}</>;
}
