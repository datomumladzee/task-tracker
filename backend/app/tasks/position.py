"""Where a task sits in its column.

Pure arithmetic. No FastAPI, no database, no models, so every function here
runs in a plain Python shell and is tested without a session.

Why floats at all: a board reorder should touch one row. With integers,
inserting between 3 and 4 means renumbering everything below. With floats you
write the midpoint, 3.5, and nothing else moves.

The catch is that midpoints halve the gap each time. Drop repeatedly into the
same slot and the gap shrinks 500, 250, 125, and after about fifty moves two
tasks are closer together than a float can represent. needs_rebalance spots
that coming, and rebalance spreads the column out again.
"""

# Spacing used for a fresh column and after a rebalance. Large so there is
# room to insert between neighbours many times before anything converges.
GAP = 1000.0

# Below this, two positions are too close to keep splitting. Far above the
# limit of float precision at these magnitudes, so the rebalance happens well
# before two tasks could ever collide.
MIN_GAP = 1e-6


def position_at_end(last: float | None) -> float:
    """Position for a task added to the bottom of a column.

    last is the position of the current bottom task, or None if the column is
    empty. New tasks go here, which is why a client never sends a position.
    """
    if last is None:
        return GAP
    return last + GAP


def position_between(above: float | None, below: float | None) -> float:
    """Position for a task dropped between two neighbours.

    above is the task it goes under, below the task it goes over. None means
    there is nothing on that side:

        both None    the column is empty
        above None   it goes to the very top
        below None   it goes to the very bottom

    Raises ValueError if the two are the wrong way round, which means the
    caller looked up the wrong neighbours.
    """
    if above is None and below is None:
        return GAP
    if above is None:
        # Halving the top position keeps it above nothing else and below the
        # current first task.
        return below / 2
    if below is None:
        return position_at_end(above)

    if above >= below:
        raise ValueError(f"above ({above}) must be less than below ({below})")

    return (above + below) / 2


def needs_rebalance(above: float | None, below: float | None) -> bool:
    """Whether the gap is too small to split again.

    Checked before writing, so the column is spread out first and the new
    position is computed in the roomy column rather than the cramped one.
    """
    if above is None and below is None:
        return False
    if above is None:
        # Splitting the top means halving `below`, which eventually reaches
        # zero and then cannot go lower.
        return below < MIN_GAP
    if below is None:
        return False

    return (below - above) < MIN_GAP


def rebalance(count: int) -> list[float]:
    """Evenly spaced positions for a whole column, in display order.

    Returns what every task's position should become, so the caller pairs them
    with the tasks it already has in order. Rewrites every row in the column,
    which is the expensive path, and exactly why GAP is large enough that it
    almost never runs.
    """
    if count < 0:
        raise ValueError("count cannot be negative")
    return [GAP * (i + 1) for i in range(count)]
