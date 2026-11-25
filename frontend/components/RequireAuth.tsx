"use client";

// Wraps pages that need a login. Logged out: send to /login. Still checking
// the stored token: show a placeholder rather than flashing the page.
//
// This is convenience, not security. The backend checks the token on every
// request, so skipping this wrapper would only show empty pages and 401s.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { loginPath, useAuth } from "@/lib/auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { status, signedOutOnPurpose } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status !== "out") return;
    // Chose Sign out: a plain sign-in page. Arrived signed out, or the
    // session ran out: remember this page, so signing in comes back to it.
    // window.location rather than useSearchParams, which would need a
    // Suspense boundary around every page.
    const here = window.location.pathname + window.location.search;
    router.replace(signedOutOnPurpose ? "/login" : loginPath(here));
  }, [status, signedOutOnPurpose, router]);

  if (status !== "in") return <p className="p-8 text-sm text-muted">Loading...</p>;
  return <>{children}</>;
}
