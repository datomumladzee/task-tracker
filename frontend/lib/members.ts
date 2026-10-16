// The one membership rule the frontend can see coming: a project must keep
// at least one admin (LastAdmin in backend/app/projects/service.py). Knowing
// it here lets the page disable the controls that would only get a 409.
// The backend still decides; another admin could leave in the meantime.

import type { Member } from "./types";

export function isLastAdmin(members: Member[], userId: number): boolean {
  const admins = members.filter((m) => m.role === "admin");
  return admins.length === 1 && admins[0].user.id === userId;
}

export const LAST_ADMIN_REASON = "A project needs at least one admin. Make someone else admin first.";
