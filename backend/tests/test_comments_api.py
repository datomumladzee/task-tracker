"""Comment endpoints.

The rule that differs from tasks: a comment belongs to a person. Only the
author edits it, and only the author or a project admin deletes it.
"""

from types import SimpleNamespace

import pytest
from httpx import AsyncClient


@pytest.fixture
async def thread(client: AsyncClient, auth_headers):
    headers, ids = {}, {}
    for who in ("admin", "standard", "viewer", "outsider"):
        headers[who] = await auth_headers(f"{who}@example.com")
        ids[who] = (await client.get("/users/me", headers=headers[who])).json()["id"]

    pid = (await client.post("/projects", json={"name": "P"}, headers=headers["admin"])).json()["id"]
    for who in ("standard", "viewer"):
        await client.post(
            f"/projects/{pid}/members",
            json={"email": f"{who}@example.com", "role": who},
            headers=headers["admin"],
        )

    tid = (await client.post(
        f"/projects/{pid}/tasks", json={"title": "t"}, headers=headers["admin"]
    )).json()["id"]
    url = f"/projects/{pid}/tasks/{tid}/comments"

    written = (await client.post(
        url, json={"body": "first"}, headers=headers["standard"]
    )).json()

    return SimpleNamespace(pid=pid, tid=tid, url=url, h=headers, ids=ids, comment=written)


# ---------------------------------------------------------------------------
# writing and reading
# ---------------------------------------------------------------------------


async def test_create_returns_the_author(client: AsyncClient, thread):
    assert thread.comment["body"] == "first"
    assert thread.comment["author"]["email"] == "standard@example.com"
    assert set(thread.comment["author"]) == {"id", "email", "full_name"}


async def test_viewer_can_read_but_not_write(client: AsyncClient, thread):
    read = await client.get(thread.url, headers=thread.h["viewer"])
    write = await client.post(thread.url, json={"body": "hi"}, headers=thread.h["viewer"])

    assert read.status_code == 200
    assert write.status_code == 403


async def test_comments_come_back_oldest_first(client: AsyncClient, thread):
    await client.post(thread.url, json={"body": "second"}, headers=thread.h["admin"])
    await client.post(thread.url, json={"body": "third"}, headers=thread.h["standard"])

    bodies = [c["body"] for c in (await client.get(thread.url, headers=thread.h["viewer"])).json()]

    assert bodies == ["first", "second", "third"]


async def test_body_is_stripped_and_cannot_be_blank(client: AsyncClient, thread):
    padded = await client.post(thread.url, json={"body": "  spaced  "}, headers=thread.h["admin"])
    blank = await client.post(thread.url, json={"body": "   "}, headers=thread.h["admin"])

    assert padded.json()["body"] == "spaced"
    assert blank.status_code == 422


async def test_outsider_sees_nothing(client: AsyncClient, thread):
    assert (await client.get(thread.url, headers=thread.h["outsider"])).status_code == 404


# ---------------------------------------------------------------------------
# editing, author only
# ---------------------------------------------------------------------------


async def test_author_edits_their_own(client: AsyncClient, thread):
    response = await client.patch(
        f"{thread.url}/{thread.comment['id']}",
        json={"body": "edited"},
        headers=thread.h["standard"],
    )

    assert response.status_code == 200
    assert response.json()["body"] == "edited"


async def test_not_even_an_admin_can_edit_someone_elses(client: AsyncClient, thread):
    """Deleting abuse is an admin job. Rewriting what someone said is not."""
    response = await client.patch(
        f"{thread.url}/{thread.comment['id']}",
        json={"body": "words i did not write"},
        headers=thread.h["admin"],
    )

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# deleting, author or admin
# ---------------------------------------------------------------------------


async def test_author_deletes_their_own(client: AsyncClient, thread):
    response = await client.delete(
        f"{thread.url}/{thread.comment['id']}", headers=thread.h["standard"]
    )

    assert response.status_code == 204
    assert (await client.get(thread.url, headers=thread.h["viewer"])).json() == []


async def test_admin_deletes_someone_elses(client: AsyncClient, thread):
    response = await client.delete(
        f"{thread.url}/{thread.comment['id']}", headers=thread.h["admin"]
    )
    assert response.status_code == 204


async def test_another_member_cannot_delete_it(client: AsyncClient, thread):
    mine = (await client.post(
        thread.url, json={"body": "admin's words"}, headers=thread.h["admin"]
    )).json()

    response = await client.delete(f"{thread.url}/{mine['id']}", headers=thread.h["standard"])

    assert response.status_code == 403


# ---------------------------------------------------------------------------
# scoping
# ---------------------------------------------------------------------------


async def test_a_comment_from_another_task_is_404(client: AsyncClient, thread):
    other_task = (await client.post(
        f"/projects/{thread.pid}/tasks", json={"title": "other"}, headers=thread.h["admin"]
    )).json()["id"]
    wrong_url = f"/projects/{thread.pid}/tasks/{other_task}/comments/{thread.comment['id']}"

    response = await client.delete(wrong_url, headers=thread.h["admin"])

    assert response.status_code == 404


async def test_deleting_the_task_takes_its_comments(client: AsyncClient, thread):
    await client.delete(f"/projects/{thread.pid}/tasks/{thread.tid}", headers=thread.h["admin"])

    assert (await client.get(thread.url, headers=thread.h["admin"])).status_code == 404
