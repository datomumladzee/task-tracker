"use client";

// The bar at the top of every logged-in page.

import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { Button } from "./ui/Button";
import { HealthBadge } from "./HealthBadge";

export function AppHeader() {
  const { user, signOut } = useAuth();
  return (
    <header className="flex items-center gap-4 border-b border-zinc-200 bg-white px-6 py-3">
      <Link href="/projects" className="font-semibold">
        Task Tracker
      </Link>
      <nav className="flex gap-3 text-sm text-zinc-600">
        <Link href="/projects" className="hover:text-zinc-900">Projects</Link>
        <Link href="/settings" className="hover:text-zinc-900">Settings</Link>
      </nav>
      <div className="ml-auto flex items-center gap-3 text-sm">
        <HealthBadge />
        <span className="text-zinc-600">{user?.full_name}</span>
        <Button variant="secondary" onClick={signOut}>Log out</Button>
      </div>
    </header>
  );
}
