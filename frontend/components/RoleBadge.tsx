// The caller's role on a project, as a small label.

import type { ProjectRole } from "@/lib/types";

const look: Record<ProjectRole, string> = {
  admin: "bg-violet-100 text-violet-800",
  standard: "bg-sky-100 text-sky-800",
  viewer: "bg-zinc-200 text-zinc-700",
};

export function RoleBadge({ role }: { role: ProjectRole }) {
  return <span className={`rounded px-2 py-0.5 text-xs ${look[role]}`}>{role}</span>;
}
