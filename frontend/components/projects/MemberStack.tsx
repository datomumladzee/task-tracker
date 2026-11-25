// The link to a project's members, shown as up to three overlapping initials
// and "+N" for the rest. The members are already loaded on the board, so this
// costs no request.
//
// Circles use the same navy shades as the project tiles, picked by user id,
// so a person keeps their colour. Never lime: lime is your own avatar and the
// AI. Screen readers get one plain name, "Members, 5 people".

import Link from "next/link";
import type { Member } from "@/lib/types";

const shades = ["bg-tile-1", "bg-tile-2", "bg-tile-3", "bg-tile-4"];
const SHOWN = 3;

export function MemberStack({ projectId, members }: { projectId: number; members: Member[] }) {
  const shown = members.slice(0, SHOWN);
  const rest = members.length - shown.length;
  const people = `${members.length} ${members.length === 1 ? "person" : "people"}`;

  return (
    <Link
      href={`/projects/${projectId}/members`}
      aria-label={`Members, ${people}`}
      title={members.map((m) => m.user.full_name).join(", ")}
      className="group flex items-center gap-2 rounded-full py-1 pr-1 text-sm text-ink"
    >
      <span className="flex -space-x-2" aria-hidden="true">
        {shown.map((m) => (
          // ring-page cuts a thin gap in the page colour where circles overlap.
          <span
            key={m.user.id}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white ring-2 ring-page ${shades[m.user.id % shades.length]}`}
          >
            {(m.user.full_name.trim() || m.user.email).charAt(0).toUpperCase()}
          </span>
        ))}
        {rest > 0 && (
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-line px-1.5 text-xs font-semibold text-ink ring-2 ring-page">
            +{rest}
          </span>
        )}
      </span>
      <span className="group-hover:text-navy group-hover:underline">Members</span>
    </Link>
  );
}
