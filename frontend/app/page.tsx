"use client";

// The front door: logged in goes to projects, logged out to login.

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function Home() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "in") router.replace("/projects");
    if (status === "out") router.replace("/login");
  }, [status, router]);

  return <p className="p-8 text-sm text-zinc-500">Loading...</p>;
}
