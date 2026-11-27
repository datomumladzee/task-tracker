"use client";

// One member. Admins may change anyone's role and remove anyone; everyone
// may leave. The last admin's controls are disabled with the reason, since
// the backend would refuse them with 409.

import { Select } from "../ui/Select";
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
    <li className="space-y-2 rounded-lg border border-line bg-card p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{member.user.full_name}{isMe && <span className="ml-1 text-sm font-normal text-muted">(you)</span>}</p>
          <p className="truncate text-sm text-muted">{member.user.email}</p>
        </div>
        {isAdmin ? (
          <Select
            aria-label={`Role for ${member.user.full_name}`}
            value={member.role}
            disabled={busy || lastAdmin}
            title={lastAdmin ? LAST_ADMIN_REASON : undefined}
            onChange={(v) => changeRole(v as ProjectRole)}
            options={ROLES.map((r) => ({ value: r, label: r }))}
          />
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
      {lastAdmin && isAdmin && <p className="text-xs text-muted">{LAST_ADMIN_REASON}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </li>
  );
}
