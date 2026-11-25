"use client";

// Whether the desktop sidebar is collapsed to its icon rail, remembered in
// this browser. A per-viewer convenience, so localStorage is the right place;
// if storage is blocked the sidebar simply starts expanded every time.
//
// useSyncExternalStore keeps every reader in step. The "storage" event only
// fires in other tabs, so a change in this tab sends its own event too.

import { useSyncExternalStore } from "react";

const KEY = "taskTracker.sidebarCollapsed";
const EVENT = "task-tracker:sidebar";

// The last choice made in this tab, used when storage is blocked, so the
// toggle still works until the page reloads.
let memory = false;

function read(): boolean {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored !== null) return stored === "1";
  } catch {
    // Storage blocked: fall through to the in-memory choice.
  }
  return memory;
}

export function setSidebarCollapsed(collapsed: boolean) {
  memory = collapsed;
  try {
    window.localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    // Storage blocked: memory carries it until the page reloads.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      window.addEventListener("storage", onChange);
      window.addEventListener(EVENT, onChange);
      return () => {
        window.removeEventListener("storage", onChange);
        window.removeEventListener(EVENT, onChange);
      };
    },
    read,
    () => false,
  );
}
