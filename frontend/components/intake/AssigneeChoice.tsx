"use client";

// The draft's assignee, which only makes sense inside a project: the same
// name can be a different person, or nobody, in another one.
//
//   waiting    the project is not known yet, so there is nothing to check
//   not_given  nobody was named; unassigned unless the user picks someone
//   resolved   one member matched
//   ambiguous  several matched: the question and one button each
//   unknown    nobody matched: the question, pick someone or leave it empty

import { Question } from "./Question";
import type { Member, Resolution } from "@/lib/types";

type Props = {
  resolution: Resolution;
  // Members of the chosen project, or null while there is no project.
  members: Member[] | null;
  // The user's answer: undefined not answered, null nobody, or a user id.
  answer: number | null | undefined;
  onPick: (id: number | null) => void;
};

export function AssigneeChoice({ resolution, members, answer, onPick }: Props) {
  const unsure = answer === undefined && (resolution.outcome === "ambiguous" || resolution.outcome === "unknown");

  // What the dropdown shows: the answer, else the resolver's match, else
  // "unassigned" when nobody was named.
  let value = "";
  if (answer !== undefined) value = answer === null ? "none" : String(answer);
  else if (resolution.outcome === "resolved" && resolution.id !== null) value = String(resolution.id);
  else if (resolution.outcome === "not_given") value = "none";

  if (members === null) {
    return (
      <div className="text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Assignee</span>
        <p className="text-zinc-500">
          {resolution.ref ? `"${resolution.ref}", checked once a project is chosen.` : "Unassigned"}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm">
        <span className="mb-1 block font-medium text-zinc-700">Assignee</span>
        <select
          aria-label="Assignee"
          value={value}
          onChange={(e) => onPick(e.target.value === "none" ? null : Number(e.target.value))}
          className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5"
        >
          {value === "" && <option value="">{resolution.ref ? `"${resolution.ref}", checked on confirm` : "Choose..."}</option>}
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.user.id} value={m.user.id}>{m.user.full_name} ({m.user.email})</option>
          ))}
        </select>
      </label>
      {unsure && (
        <>
          <Question question={resolution.question} candidates={resolution.candidates} onPick={onPick} />
          <button type="button" onClick={() => onPick(null)} className="text-sm text-zinc-600 underline">
            Leave unassigned
          </button>
        </>
      )}
    </div>
  );
}
