"use client";

// Shows whether the backend answers. Useful on every page while developing:
// if this is red, every other error on the page has the same cause.

import { useEffect, useState } from "react";
import { health } from "@/lib/endpoints";

export function HealthBadge() {
  const [state, setState] = useState<"checking" | "ok" | "down">("checking");

  useEffect(() => {
    health()
      .then((r) => setState(r.status === "ok" ? "ok" : "down"))
      .catch(() => setState("down"));
  }, []);

  const styles = {
    checking: "bg-zinc-200 text-zinc-700",
    ok: "bg-emerald-100 text-emerald-800",
    down: "bg-red-100 text-red-800",
  };
  const text = { checking: "API: checking", ok: "API: ok", down: "API: down" };

  return <span className={`rounded px-2 py-0.5 text-xs ${styles[state]}`}>{text[state]}</span>;
}
