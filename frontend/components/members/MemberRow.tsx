"use client";

// One member. Admins may change anyone's role and remove anyone; everyone
// may leave. The last admin's controls are disabled with the reason, since
// the backend would refuse them with 409.

import { useState } from "react";
import { RoleBadge } from "../RoleBadge";
import { ConfirmButton } from "../ui/ConfirmButton";
import { changeMemberRole, removeMember } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { LAST_ADMIN_REASON } from "@/lib/members";
import { ROLES, type Member, type ProjectRole } from "@/lib/types";

type Props = {
  projectId: number;
  member: Member;
  isMe: boolean;
  isAdmin: boolean;
  lastAdmin: boolean;
  onChanged: (m: Member) => void;
  onRemoved: (userId: number) => void;
};

export function MemberRow({ projectId, member, isMe, isAdmin, lastAdmin, onChanged, onRemoved }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function changeRole(role: ProjectRole) {
    setBusy(true);
    setError(null);
    try {
      onChanged(await changeMemberRole(projectId, member.user.id, role));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="space-y-2 rounded-lg border border-zinc-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{member.user.full_name}{isMe && <span className="ml-1 text-sm font-normal text-zinc-500">(you)</span>}</p>
          <p className="truncate text-sm text-zinc-500">{member.user.email}</p>
        </div>
        {isAdmin ? (
          <select
            aria-label={`Role for ${member.user.full_name}`}
            value={member.role}
            disabled={busy || lastAdmin}
            title={lastAdmin ? LAST_ADMIN_REASON : undefined}
            onChange={(e) => changeRole(e.target.value as ProjectRole)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        ) : (
          <RoleBadge role={member.role} />
        )}
        {(isAdmin || isMe) && (
          <ConfirmButton
            label={isMe ? "Leave project" : "Remove"}
            question={isMe ? "Leave this project? You will lose access until an admin adds you back." : `Remove ${member.user.full_name} from this project?`}
            yes={isMe ? "Yes, leave" : "Yes, remove"}
            disabled={lastAdmin}
            disabledReason={LAST_ADMIN_REASON}
            onConfirm={async () => {
              await removeMember(projectId, member.user.id);
              onRemoved(member.user.id);
            }}
          />
        )}
      </div>
      {lastAdmin && isAdmin && <p className="text-xs text-zinc-500">{LAST_ADMIN_REASON}</p>}
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </li>
  );
}
