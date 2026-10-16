"use client";

// The draft's project. Resolved: shown, with a dropdown to change it.
// Ambiguous or unknown: the resolver's question and candidates, plus the same
// dropdown, since "unknown" may have no candidates at all.

import { Question } from "./Question";
import type { Project, Resolution } from "@/lib/types";

type Props = {
  resolution: Resolution;
  projects: Project[];
  // The project the task will go into, or null while none is chosen.
  value: number | null;
  onPick: (id: number) => void;
};

export function ProjectChoice({ resolution, projects, value, onPick }: Props) {
  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Project</span>
        <select
          aria-label="Project"
          value={value ?? ""}
          onChange={(e) => onPick(Number(e.target.value))}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5"
        >
          {value === null && <option value="">Choose a project...</option>}
          {projects.map((p) => (
            // Viewers cannot create tasks, so confirm would answer 403. Shown
            // but disabled, so the user sees why the project is not usable.
            <option key={p.id} value={p.id} disabled={p.role === "viewer"}>
              {p.name}{p.role === "viewer" ? " (view only)" : ""}
            </option>
          ))}
        </select>
      </label>
      {value === null && <Question question={resolution.question} candidates={resolution.candidates} onPick={onPick} />}
    </div>
  );
}
