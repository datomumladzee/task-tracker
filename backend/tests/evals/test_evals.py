"""Score the real model, plus the resolver, against tests/evals/cases.yaml.

Run with `make eval`. Skipped otherwise: it calls Google, uses free-tier quota
and takes a couple of minutes. It reports a score and saves it to results/,
rather than passing or failing, because the model's answers vary a little
from run to run and a pass/fail would flicker.

The point is comparison. Run it, change the prompt, run it again, and the two
results files say whether the change helped.
"""

import asyncio
import json
import os
from collections import Counter
from datetime import date, datetime, timezone
from pathlib import Path

import pytest
import yaml

from app.core import llm
from app.core.config import settings
from app.intake.parser import parse_task
from app.intake.resolver import resolve_draft
from app.intake.schemas import Outcome, ResolvedDraft, TaskDraft
from app.projects import service as projects
from app.projects.models import ProjectRole
from app.users.schemas import UserCreate
from app.users.service import create_user

HERE = Path(__file__).parent
CASES = HERE / "cases.yaml"
RESULTS = HERE / "results"

# Seconds between requests. The free tier caps requests per minute, and a
# burst of 25 would hit it. Raise with EVAL_PAUSE_SECONDS if you see 429s.
PAUSE = float(os.environ.get("EVAL_PAUSE_SECONDS", "4"))

pytestmark = [
    pytest.mark.eval,
    pytest.mark.skipif(
        os.environ.get("RUN_EVALS") != "1",
        reason="calls the real model; run with `make eval`",
    ),
]


# ---------------------------------------------------------------------------
# the world every case runs in
# ---------------------------------------------------------------------------


async def _seed(db, spec) -> dict:
    """Create the people and projects from cases.yaml in the test database.

    Returns lookups from ids back to names and emails, so a result can be
    compared against the human-readable expectations in the file.
    """
    async def person(email, name):
        return await create_user(db, UserCreate(email=email, password="hunter2!!", full_name=name))

    me = await person(spec["me"]["email"], spec["me"]["name"])
    users = {me.id: me.email}
    for p in spec["people"]:
        u = await person(p["email"], p["name"])
        users[u.id] = u.email

    project_names = {}
    for name, members in spec["projects"].items():
        project = await projects.create_project(db, user_id=me.id, name=name)
        project_names[project.id] = name
        for email in members:
            await projects.add_member(
                db, project_id=project.id, email=email, role=ProjectRole.STANDARD
            )

    return {"me": me, "users": users, "projects": project_names}


# ---------------------------------------------------------------------------
# calling the model politely
# ---------------------------------------------------------------------------


async def _parse_with_retry(text, *, today, project_names) -> tuple[TaskDraft, llm.LLMResult]:
    """Retry a busy or rate-limited model a couple of times before giving up.

    The free tier answers 503 under load and 429 when the per-minute cap is
    hit. One case failing for that reason says nothing about the prompt, so
    it gets a second and third chance.
    """
    for attempt, wait in enumerate((0, 15, 30)):
        if wait:
            await asyncio.sleep(wait)
        try:
            return await parse_task(text, today=today, project_names=project_names)
        except (llm.LLMRateLimited, llm.LLMUnavailable):
            if attempt == 2:
                raise
    raise AssertionError("unreachable")


# ---------------------------------------------------------------------------
# grading
# ---------------------------------------------------------------------------


def _grade(expect: dict, draft: TaskDraft, resolved: ResolvedDraft, world: dict) -> dict:
    """One verdict per checked field: (passed, what we got)."""
    checks = {}

    if "title_contains" in expect:
        title = draft.title.lower()
        ok = all(word.lower() in title for word in expect["title_contains"])
        checks["title"] = (ok, draft.title)

    if "due_date" in expect:
        want = expect["due_date"]
        checks["due_date"] = (draft.due_date == want, draft.due_date and draft.due_date.isoformat())

    for field in ("priority", "status"):
        if field in expect:
            got = getattr(draft, field)
            got = got.value if got is not None else None
            checks[field] = (got == expect[field], got)

    if "project" in expect:
        want, got = expect["project"], resolved.project
        ok = got.outcome.value == want["outcome"]
        if ok and want["outcome"] == "resolved":
            ok = world["projects"].get(got.id) == want["name"]
        if ok and "candidates" in want:
            ok = sorted(c.label for c in got.candidates) == sorted(want["candidates"])
        shown = world["projects"].get(got.id) if got.id else [c.label for c in got.candidates] or None
        checks["project"] = (ok, f"{got.outcome.value} {shown or ''}".strip())

    if "assignee" in expect:
        want, got = expect["assignee"], resolved.assignee
        allowed = want["outcome"] if isinstance(want["outcome"], list) else [want["outcome"]]
        ok = got.outcome.value in allowed
        if ok and got.outcome == Outcome.RESOLVED and "email" in want:
            ok = world["users"].get(got.id) == want["email"]
        shown = world["users"].get(got.id) if got.id else ""
        checks["assignee"] = (ok, f"{got.outcome.value} {shown}".strip())

    return checks


# ---------------------------------------------------------------------------
# the run
# ---------------------------------------------------------------------------


async def test_evals(db):
    if not settings.gemini_api_key:
        pytest.skip("GEMINI_API_KEY is not set")

    spec = yaml.safe_load(CASES.read_text())
    today: date = spec["today"]
    world = await _seed(db, spec)
    names = list(world["projects"].values())

    rows, by_field, by_field_total = [], Counter(), Counter()
    started = datetime.now(timezone.utc)

    for i, case in enumerate(spec["cases"]):
        if i:
            await asyncio.sleep(PAUSE)
        try:
            draft, usage = await _parse_with_retry(case["text"], today=today, project_names=names)
        except llm.LLMError as e:
            rows.append({"id": case["id"], "passed": False, "error": type(e).__name__, "checks": {}})
            continue

        resolved = await resolve_draft(db, draft, user_id=world["me"].id)
        checks = _grade(case["expect"], draft, resolved, world)
        for field, (ok, _) in checks.items():
            by_field_total[field] += 1
            by_field[field] += ok
        rows.append({
            "id": case["id"],
            "passed": all(ok for ok, _ in checks.values()),
            "checks": {f: {"ok": ok, "got": got} for f, (ok, got) in checks.items()},
            "model": usage.model,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "latency_ms": usage.latency_ms,
        })

    passed = sum(r["passed"] for r in rows)
    errors = sum("error" in r for r in rows)

    # --- the report ----------------------------------------------------------
    print(f"\n\nmodel {settings.gemini_model}   today {today}   {len(rows)} cases\n")
    for r in rows:
        mark = "PASS" if r["passed"] else ("ERR " if "error" in r else "FAIL")
        misses = [f"{f}={c['got']!r}" for f, c in r["checks"].items() if not c["ok"]]
        print(f"  {mark}  {r['id']:32} {r.get('error', '') or '  '.join(misses)}")
    print()
    for field in ("title", "due_date", "priority", "status", "project", "assignee"):
        if by_field_total[field]:
            print(f"  {field:10} {by_field[field]:>3}/{by_field_total[field]}")
    print(f"  {'-' * 18}\n  {'all right':10} {passed:>3}/{len(rows)}" + (f"   ({errors} errors)" if errors else ""))

    # --- what a request costs ------------------------------------------------
    # The free tier has no bill, so these stand in for the plan's "cost per
    # request". Latency is the successful call only, not time spent retrying.
    measured = [r for r in rows if "latency_ms" in r]
    usage_summary = {}
    if measured:
        latencies = sorted(r["latency_ms"] for r in measured)
        usage_summary = {
            "avg_input_tokens": round(sum(r["input_tokens"] for r in measured) / len(measured)),
            "avg_output_tokens": round(sum(r["output_tokens"] for r in measured) / len(measured)),
            "median_latency_ms": latencies[len(latencies) // 2],
            "max_latency_ms": latencies[-1],
            "answered_by": dict(Counter(r["model"] for r in measured)),
        }
        print(
            f"\n  tokens   {usage_summary['avg_input_tokens']} in, "
            f"{usage_summary['avg_output_tokens']} out, on average"
        )
        print(
            f"  latency  {usage_summary['median_latency_ms']} ms median, "
            f"{usage_summary['max_latency_ms']} ms slowest"
        )
        print(f"  models   {usage_summary['answered_by']}")

    RESULTS.mkdir(exist_ok=True)
    out = RESULTS / f"{started:%Y-%m-%d-%H%M}-{settings.gemini_model}.json"
    out.write_text(json.dumps({
        "model": settings.gemini_model,
        "run_at": started.isoformat(),
        "today": today.isoformat(),
        "passed": passed,
        "total": len(rows),
        "errors": errors,
        "by_field": {f: [by_field[f], by_field_total[f]] for f in by_field_total},
        "usage": usage_summary,
        "cases": rows,
    }, indent=2, default=str) + "\n")
    print(f"\n  saved {out.relative_to(HERE.parent.parent)}")
