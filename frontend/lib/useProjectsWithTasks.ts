"use client";

// Your projects, and then every task in each of them. Shared by the Projects
// page (progress bars and counts) and My tasks.
//
// Two stages. The projects list comes first, so a page can draw what it has
// at once. Then one tasks request per project, all at the same time, each
// stored as it arrives: undefined while loading, "error" if it failed. A slow
// or failing project never holds up the others.
//
// Cost: one request per project. Fine for a handful; with many projects a
// backend endpoint such as GET /users/me/tasks would replace the loop.

import { useCallback, useEffect, useState } from "react";
import { listProjects, listTasks } from "./endpoints";
import { errorMessage } from "./errors";
import type { Project, Task } from "./types";

export type TasksByProject = Record<number, Task[] | "error">;

export function useProjectsWithTasks() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TasksByProject>({});

  const reload = useCallback(() => {
    listProjects()
      .then((p) => {
        setProjects(p);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  useEffect(reload, [reload]);

  // `live` drops answers that land after the list was reloaded or the page
  // was left.
  useEffect(() => {
    if (!projects) return;
    let live = true;
    for (const p of projects) {
      listTasks(p.id)
        .then((list) => {
          if (live) setTasks((t) => ({ ...t, [p.id]: list }));
        })
        .catch(() => {
          if (live) setTasks((t) => ({ ...t, [p.id]: "error" }));
        });
    }
    return () => {
      live = false;
    };
  }, [projects]);

  return { projects, error, tasks, reload };
}
