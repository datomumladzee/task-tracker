"use client";

// The draft's project. Resolved: shown, with a dropdown to change it.
// Ambiguous or unknown: the resolver's question and candidates, plus the same
// dropdown, since "unknown" may have no candidates at all.

import { Select } from "../ui/Select";
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
        <span className="mb-1 block font-medium text-ink">Project</span>
        <Select
          aria-label="Project"
          fullWidth
          value={value === null ? "" : String(value)}
          onChange={(v) => onPick(Number(v))}
          placeholder="Choose a project..."
          // Viewers cannot create tasks, so confirm would answer 403. Shown
          // but disabled, so the user sees why the project is not usable.
          options={projects.map((p) => ({
            value: String(p.id),
            label: `${p.name}${p.role === "viewer" ? " (view only)" : ""}`,
            disabled: p.role === "viewer",
          }))}
        />
      </label>
      {value === null && <Question question={resolution.question} candidates={resolution.candidates} onPick={onPick} />}
    </div>
  );
}
