// What the resolver was unsure about, with one button per candidate it found.
// The question text comes from the backend, so the wording lives in one place.

import type { Candidate } from "@/lib/types";

type Props = {
  question: string | null;
  candidates: Candidate[];
  onPick: (id: number) => void;
};

export function Question({ question, candidates, onPick }: Props) {
  return (
    <div className="space-y-2 rounded bg-amber-50 p-2">
      {question && <p className="text-sm text-amber-900">{question}</p>}
      {candidates.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {candidates.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className="rounded border border-amber-300 bg-white px-2 py-1 text-sm hover:bg-amber-100"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
