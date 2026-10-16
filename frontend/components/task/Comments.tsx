"use client";

// A task's comments: read by anyone in the project, written by standard and
// admin, deleted by their author or a project admin.
// Decision: no comment editing in the UI yet. The backend allows the author
// to edit, but the step asked for reading and adding; deleting covers typos.

import { useEffect, useState } from "react";
import { Button } from "../ui/Button";
import { ErrorText } from "../ui/ErrorText";
import { createComment, deleteComment, listComments } from "@/lib/endpoints";
import { errorMessage } from "@/lib/errors";
import { can } from "@/lib/permissions";
import type { Comment, ProjectRole, Task } from "@/lib/types";

type Props = {
  task: Task;
  role: ProjectRole;
  currentUserId: number;
};

export function Comments({ task, role, currentUserId }: Props) {
  const [comments, setComments] = useState<Comment[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    listComments(task.project_id, task.id)
      .then((c) => live && setComments(c))
      .catch((e) => live && setLoadError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [task.project_id, task.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const created = await createComment(task.project_id, task.id, body);
      setComments((c) => [...(c ?? []), created]);
      setBody("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(comment: Comment) {
    setError(null);
    try {
      await deleteComment(task.project_id, task.id, comment.id);
      setComments((c) => (c ?? []).filter((x) => x.id !== comment.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="font-semibold">Comments</h3>
      {loadError && <ErrorText message={loadError} />}
      {!loadError && comments === null && <p className="text-sm text-zinc-500">Loading comments...</p>}
      {comments?.length === 0 && <p className="text-sm text-zinc-500">No comments yet.</p>}
      <ul className="space-y-2">
        {comments?.map((c) => (
          <li key={c.id} className="rounded border border-zinc-200 bg-zinc-50 p-2 text-sm">
            <div className="mb-1 flex items-center justify-between text-xs text-zinc-500">
              {/* author is null after that account was deleted. */}
              <span>{c.author?.full_name ?? "Deleted user"} · {new Date(c.created_at).toLocaleString()}</span>
              {can.deleteComment(role, c.author?.id === currentUserId) && (
                <button type="button" onClick={() => remove(c)} className="text-red-700 hover:underline">Delete</button>
              )}
            </div>
            <p className="whitespace-pre-wrap">{c.body}</p>
          </li>
        ))}
      </ul>
      {can.comment(role) && (
        <form onSubmit={add} className="space-y-2">
          <textarea
            aria-label="New comment"
            placeholder="Write a comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={5000}
            rows={2}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          />
          <Button type="submit" disabled={busy || !body.trim()}>{busy ? "Posting..." : "Add comment"}</Button>
        </form>
      )}
      <ErrorText message={error} />
    </section>
  );
}
