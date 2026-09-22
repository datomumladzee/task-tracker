"""The position maths, with no database in sight.

Every test here is synchronous and instant, because position.py imports
nothing but the standard library.
"""

import pytest

from app.tasks.position import (
    GAP,
    MIN_GAP,
    needs_rebalance,
    position_at_end,
    position_between,
    rebalance,
)


def test_first_task_in_an_empty_column():
    assert position_at_end(None) == GAP
    assert position_between(None, None) == GAP


def test_appending_leaves_room_below():
    assert position_at_end(1000.0) == 2000.0


def test_between_two_neighbours_is_the_midpoint():
    assert position_between(1000.0, 2000.0) == 1500.0


def test_to_the_very_top_halves_the_first_position():
    new = position_between(None, 1000.0)
    assert new == 500.0
    assert 0 < new < 1000.0


def test_to_the_very_bottom_appends():
    assert position_between(3000.0, None) == 4000.0


def test_neighbours_the_wrong_way_round_raise():
    """Means the caller looked up the wrong tasks, so fail loudly."""
    with pytest.raises(ValueError):
        position_between(2000.0, 1000.0)
    with pytest.raises(ValueError):
        position_between(1000.0, 1000.0)


def test_a_normal_gap_does_not_need_rebalancing():
    assert needs_rebalance(1000.0, 2000.0) is False
    assert needs_rebalance(None, None) is False
    assert needs_rebalance(1000.0, None) is False


def test_a_tiny_gap_needs_rebalancing():
    assert needs_rebalance(1000.0, 1000.0 + MIN_GAP / 2) is True
    assert needs_rebalance(None, MIN_GAP / 2) is True


def test_repeated_midpoints_converge_and_get_caught():
    """The failure this exists to prevent.

    Drop a task into the same slot over and over. The gap halves each time.
    The check must fire while the two positions are still different numbers,
    not after they have collided.
    """
    above, below = 1000.0, 2000.0
    moves = 0

    while not needs_rebalance(above, below):
        below = position_between(above, below)
        moves += 1
        assert above != below, f"positions collided after {moves} moves"
        assert moves < 200, "never triggered"

    assert 25 < moves < 60, f"caught after {moves} moves"


def test_rebalance_spreads_a_column_out():
    positions = rebalance(4)

    assert positions == [1000.0, 2000.0, 3000.0, 4000.0]
    assert positions == sorted(positions)
    assert len(set(positions)) == 4


def test_rebalance_edges():
    assert rebalance(0) == []
    with pytest.raises(ValueError):
        rebalance(-1)


def test_a_rebalanced_column_can_be_split_again():
    """After spreading out, inserting works normally again."""
    a, b = rebalance(2)

    assert needs_rebalance(a, b) is False
    assert position_between(a, b) == 1500.0
