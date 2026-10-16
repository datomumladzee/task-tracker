"use client";

// Seconds left until a moment, ticking once a second. Used after a 429 to
// show how long to wait and to keep the submit button off until then.

import { useEffect, useState } from "react";

export function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (until === null) return;
    const tick = () => setNow(Date.now());
    // Tick once right away: `now` may be from long before this wait began,
    // which would show too many seconds until the first interval fires.
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [until]);

  if (until === null) return 0;
  return Math.max(0, Math.ceil((until - now) / 1000));
}
