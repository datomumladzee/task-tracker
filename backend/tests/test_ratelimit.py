"""The in-memory rate limiter, with a clock the test moves by hand."""

from app.core.ratelimit import RateLimiter


class Clock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now


def _limiter(limit=3, window=60):
    clock = Clock()
    return RateLimiter(limit=limit, window_seconds=window, clock=clock), clock


def test_allows_up_to_the_limit():
    limiter, _ = _limiter(limit=3)

    assert [limiter.hit("u") for _ in range(3)] == [None, None, None]


def test_refuses_the_next_one_and_says_how_long_to_wait():
    limiter, clock = _limiter(limit=3, window=60)
    for _ in range(3):
        limiter.hit("u")

    clock.now += 10

    # The first hit was 10 seconds ago, so it ages out in 50.
    assert limiter.hit("u") == 50


def test_frees_up_once_the_oldest_hit_ages_out():
    limiter, clock = _limiter(limit=3, window=60)
    for _ in range(3):
        limiter.hit("u")

    clock.now += 60

    assert limiter.hit("u") is None


def test_is_a_sliding_window_not_a_reset_on_the_minute():
    """Hits spread out over time. Only the ones in the last 60 seconds count."""
    limiter, clock = _limiter(limit=3, window=60)
    limiter.hit("u")               # t=0
    clock.now += 30
    limiter.hit("u")               # t=30
    limiter.hit("u")               # t=30
    clock.now += 31                # t=61: the first hit has aged out

    assert limiter.hit("u") is None
    assert limiter.hit("u") is not None   # three in the window again


def test_waiting_and_retrying_early_does_not_extend_the_wait():
    limiter, clock = _limiter(limit=1, window=60)
    limiter.hit("u")

    for _ in range(5):
        clock.now += 1
        limiter.hit("u")

    clock.now = 1000.0 + 60
    assert limiter.hit("u") is None


def test_users_are_counted_separately():
    limiter, _ = _limiter(limit=1)

    assert limiter.hit("anna") is None
    assert limiter.hit("anna") is not None
    assert limiter.hit("giorgi") is None


def test_wait_is_never_zero():
    """A Retry-After of 0 would invite an immediate retry that also fails."""
    limiter, clock = _limiter(limit=1, window=60)
    limiter.hit("u")
    clock.now += 59.9

    assert limiter.hit("u") == 1


def test_clear_forgets_everyone():
    limiter, _ = _limiter(limit=1)
    limiter.hit("u")

    limiter.clear()

    assert limiter.hit("u") is None
