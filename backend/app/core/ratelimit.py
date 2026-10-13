"""A small per-user rate limit, kept in memory.

Built for one thing: stopping a single user from spending the shared free-tier
AI quota. Each key, a user id here, gets `limit` hits in any rolling window of
`window_seconds`. A sliding window rather than a counter that resets on the
minute, which would let someone make 10 requests at 12:00:59 and 10 more at
12:01:00.

In memory, so it resets when the server restarts and only counts requests to
this one process. That is right for a single local server. Running several
copies of the backend would need the counts somewhere shared, Redis being the
usual choice, or each copy would hand out its own full allowance.
"""

import math
import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    def __init__(
        self,
        limit: int,
        window_seconds: float,
        clock: Callable[[], float] = time.monotonic,
    ):
        """clock is injectable so tests can move time forward instantly.

        monotonic rather than wall-clock time, so a system clock adjustment
        cannot suddenly forgive or block a whole window.
        """
        self.limit = limit
        self.window = window_seconds
        self._clock = clock
        self._hits: dict[object, deque[float]] = {}

    def hit(self, key: object) -> int | None:
        """Record one attempt. Returns None if allowed, or whole seconds to wait.

        Safe under asyncio without a lock: nothing in here awaits, so no other
        request can run between the check and the record.

        A refused attempt is not recorded, so retrying early does not push the
        wait further out.
        """
        now = self._clock()
        hits = self._hits.setdefault(key, deque())

        while hits and hits[0] <= now - self.window:
            hits.popleft()

        if len(hits) >= self.limit:
            # Free again once the oldest hit in the window ages out.
            return max(1, math.ceil(hits[0] + self.window - now))

        hits.append(now)
        return None

    def clear(self) -> None:
        """Forget everyone. For tests, which share one process."""
        self._hits.clear()
