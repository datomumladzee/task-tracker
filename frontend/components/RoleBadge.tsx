// The caller's role on a project, as a small label. Never lime: lime means
// the AI, and a role has nothing to do with it.

import type { ProjectRole } from "@/lib/types";

const look: Record<ProjectRole, string> = {
  admin: "border-navy bg-navy text-white",
  standard: "border-navy text-navy",
  viewer: "border-line text-muted",
};

export function RoleBadge({ role }: { role: ProjectRole }) {
  return <span className={`rounded border px-2 py-0.5 text-xs ${look[role]}`}>{role}</span>;
}
