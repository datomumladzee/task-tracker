"use client";

// The bar at the top of every logged-in page. The only place solid navy is
// used, so the header reads as the frame and not as content.

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { HealthBadge } from "./HealthBadge";
import { Wordmark } from "./Wordmark";

export function AppHeader() {
  const { user, signOut } = useAuth();
  return (
    // The global focus ring is navy and would vanish here, so anything
    // focused inside the header gets a white one instead.
    <header className="flex items-center gap-4 bg-navy px-6 py-3 text-white [&_:focus-visible]:outline-white">
      <Link href="/projects">
        <Wordmark />
      </Link>
      <nav className="flex gap-3 text-sm text-white/75">
        <Link href="/projects" className="hover:text-white">Projects</Link>
        <Link href="/settings" className="hover:text-white">Settings</Link>
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <HealthBadge />
        <span className="text-white/75">{user?.full_name}</span>
        {/* A white outline, since the navy outline of a secondary Button
            would vanish on the navy bar. */}
        <button
          type="button"
          onClick={signOut}
          className="rounded border border-white/60 px-3 py-1.5 font-medium hover:bg-white/10"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
