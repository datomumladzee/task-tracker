"use client";

// Type a sentence, get a draft. The box at the top of the board.
//
// What each parse failure means here:
//   429  too fast, or Google's limit: wait Retry-After seconds, button off
//   503  the AI could not answer: the sentence stays in the box to retry
//   422  the sentence was empty or over 2000 characters
//   0    the backend could not be reached at all

import { useState } from "react";
import Link from "next/link";
import { DraftCard } from "./DraftCard";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { ApiError } from "@/lib/api";
import { parseIntake } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { browserTimezone } from "@/lib/intake";
import { useCountdown } from "@/lib/useCountdown";
import type { ParseResponse, Project, Task } from "@/lib/types";

type Props = {
  projects: Project[];
  currentProjectId: number;
  onCreated: (task: Task) => void;
};

export function IntakeBox({ projects, currentProjectId, onCreated }: Props) {
  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waitUntil, setWaitUntil] = useState<number | null>(null);
  const [created, setCreated] = useState<Task | null>(null);
  const wait = useCountdown(waitUntil);

  async function parse(sentence: string) {
    setBusy(true);
    setError(null);
    setCreated(null);
    try {
      setParsed(await parseIntake(sentence, browserTimezone()));
    } catch (e) {
      setParsed(null);
      if (e instanceof ApiError) {
        // The backend hands the sentence back on AI failures. It is already
        // in the box, but the server's copy is what it actually received.
        const echoed = (e.detail as { text?: unknown } | null)?.text;
        if (typeof echoed === "string") setText(echoed);
        if (e.status === 429 && e.retryAfter) setWaitUntil(Date.now() + e.retryAfter * 1000);
      }
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (text.trim()) parse(text);
  }

  function handleCreated(task: Task) {
    onCreated(task);
    setCreated(task);
    setParsed(null);
    setText("");
  }

  const waiting = wait > 0;
  const elsewhere = created && created.project_id !== currentProjectId ? projects.find((p) => p.id === created.project_id) : null;

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
      <form onSubmit={submit} className="flex gap-2">
        <input
          aria-label="Describe a task"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='Describe a task, e.g. "ship auth docs by friday, assign to me"'
          maxLength={2000}
          disabled={busy}
          className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2"
        />
        <Button type="submit" disabled={busy || waiting || !text.trim()}>
          {busy ? "Reading..." : waiting ? `Wait ${wait}s` : "Draft it"}
        </Button>
      </form>

      {/* role="status" so screen readers announce it too. Gemini usually
          answers in about a second, but a fallback model can take several. */}
      {busy && (
        <p role="status" className="flex items-center gap-2 text-sm text-zinc-600">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-zinc-400 border-t-transparent" />
          The AI is thinking about your sentence...
        </p>
      )}
      {/* Once the wait is over, the 429's "try again in N seconds" is stale. */}
      {!(error && waitUntil && !waiting) && <ErrorText message={error} />}

      {created && (
        <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Created &ldquo;{created.title}&rdquo;
          {elsewhere ? (
            <>
              {" "}in <Link href={`/projects/${elsewhere.id}`} className="underline">{elsewhere.name}</Link>
            </>
          ) : (
            " on this board"
          )}
          .
        </p>
      )}

      {parsed && (
        <DraftCard
          // A new parse is a new draft: reset all the card's edits and answers.
          key={parsed.draft_id}
          parsed={parsed}
          projects={projects}
          onCreated={handleCreated}
          onReparse={parse}
          onDiscard={() => setParsed(null)}
        />
      )}
    </section>
  );
}
