"use client";

// A project's members with their roles. Everyone sees the list and can leave;
// only admins see the add form, the role dropdowns and Remove.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AddMemberForm } from "@/components/members/AddMemberForm";
import { MemberRow } from "@/components/members/MemberRow";
import { RoleBadge } from "@/components/RoleBadge";
import { ErrorText } from "@/components/ui/ErrorText";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { listMembers, listProjects } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { isLastAdmin } from "@/lib/members";
import { can } from "@/lib/permissions";
import type { Member, Project } from "@/lib/types";

export default function MembersPage() {
  const projectId = Number(useParams<{ id: string }>().id);
  const router = useRouter();
  const { user } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The caller's role comes from the projects list, the only endpoint that
  // returns it. Reloaded after a role change, since that may be your own.
  const load = useCallback(() => {
    Promise.all([listProjects(), listMembers(projectId)])
      .then(([projects, m]) => {
        const p = projects.find((x) => x.id === projectId);
        // Same answer the backend gives a non-member: the project is not found.
        if (!p) throw new ApiError(404, "Project not found");
        setProject(p);
        setMembers(m);
      })
      .catch((e) => setError(errorMessage(e)));
  }, [projectId]);

  useEffect(load, [load]);

  if (error) {
    return (
      <div className="space-y-3">
        <ErrorText message={error} />
        <Link href="/projects" className="text-sm underline">Back to projects</Link>
      </div>
    );
  }
  if (!project || !members || !user) return <p className="text-sm text-zinc-500">Loading members...</p>;

  const isAdmin = can.manageMembers(project.role);

  function removed(userId: number) {
    // Leaving means this page is no longer yours to see.
    if (userId === user!.id) router.push("/projects");
    else setMembers((m) => (m ?? []).filter((x) => x.user.id !== userId));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/projects" className="text-sm text-zinc-500 hover:text-zinc-900">Projects</Link>
        <span className="text-zinc-400">/</span>
        <Link href={`/projects/${projectId}`} className="text-sm text-zinc-500 hover:text-zinc-900">{project.name}</Link>
        <span className="text-zinc-400">/</span>
        <h1 className="text-xl font-semibold">Members</h1>
        <RoleBadge role={project.role} />
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_300px]">
        <ul className="space-y-2">
          {members.map((m) => (
            <MemberRow
              key={m.user.id}
              projectId={projectId}
              member={m}
              isMe={m.user.id === user.id}
              isAdmin={isAdmin}
              lastAdmin={isLastAdmin(members, m.user.id)}
              onChanged={load}
              onRemoved={removed}
            />
          ))}
        </ul>
        {isAdmin && <AddMemberForm projectId={projectId} onAdded={(m) => setMembers((list) => [...(list ?? []), m])} />}
      </div>
    </div>
  );
}
