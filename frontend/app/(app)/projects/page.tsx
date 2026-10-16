"use client";

// Your projects, each with your role on it, and a form to make a new one.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { NewProjectForm } from "@/components/projects/NewProjectForm";
import { RoleBadge } from "@/components/RoleBadge";
import { ErrorText } from "@/components/ui/ErrorText";
import { listProjects } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import type { Project } from "@/lib/types";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    listProjects()
      .then((p) => {
        setProjects(p);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(load, [load]);

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Projects</h1>
        <ErrorText message={error} />
        {projects === null && !error && <p className="text-sm text-zinc-500">Loading...</p>}
        {projects?.length === 0 && <p className="text-sm text-zinc-500">No projects yet. Create one to start.</p>}
        <ul className="space-y-2">
          {projects?.map((p) => (
            <li key={p.id}>
              <Link
                href={`/projects/${p.id}`}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white px-4 py-3 hover:border-zinc-400"
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  {p.description && <span className="block text-sm text-zinc-500">{p.description}</span>}
                </span>
                <RoleBadge role={p.role} />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <NewProjectForm onCreated={load} />
    </div>
  );
}
