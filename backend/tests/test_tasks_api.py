"""Task endpoints over real HTTP, with the permission rules that matter:
anyone on the project can edit, only admins delete."""

from types import SimpleNamespace

import pytest
from httpx import AsyncClient


@pytest.fixture
async def board(client: AsyncClient, auth_headers):
    headers, ids = {}, {}
    for who in ("admin", "standard", "viewer", "outsider"):
        headers[who] = await auth_headers(f"{who}@example.com")
        ids[who] = (await client.get("/users/me", headers=headers[who])).json()["id"]

    pid = (await client.post("/projects", json={"name": "Board"}, headers=headers["admin"])).json()["id"]
    for who in ("standard", "viewer"):
        await client.post(
            f"/projects/{pid}/members",
            json={"email": f"{who}@example.com", "role": who},
            headers=headers["admin"],
        )

    url = f"/projects/{pid}/tasks"
    tasks = {
        name: (await client.post(url, json={"title": name}, headers=headers["admin"])).json()
        for name in ("a", "b", "c")
    }
    return SimpleNamespace(pid=pid, url=url, h=headers, ids=ids, tasks=tasks)


async def _titles(client, board, headers=None):
    response = await client.get(board.url, headers=headers or board.h["viewer"])
    return [t["title"] for t in response.json()]


# ---------------------------------------------------------------------------
# permissions
# ---------------------------------------------------------------------------


async def test_viewer_can_read(client: AsyncClient, board):
    assert (await client.get(board.url, headers=board.h["viewer"])).status_code == 200


async def test_viewer_cannot_write(client: AsyncClient, board):
    tid = board.tasks["a"]["id"]

    create = await client.post(board.url, json={"title": "x"}, headers=board.h["viewer"])
    edit = await client.patch(f"{board.url}/{tid}", json={"title": "x"}, headers=board.h["viewer"])
    move = await client.post(f"{board.url}/{tid}/move", json={}, headers=board.h["viewer"])

    assert [create.status_code, edit.status_code, move.status_code] == [403, 403, 403]


async def test_standard_can_write_but_not_delete(client: AsyncClient, board):
    tid = board.tasks["a"]["id"]

    created = await client.post(board.url, json={"title": "new"}, headers=board.h["standard"])
    edited = await client.patch(f"{board.url}/{tid}", json={"title": "edited"}, headers=board.h["standard"])
    deleted = await client.delete(f"{board.url}/{tid}", headers=board.h["standard"])

    assert created.status_code == 201
    assert edited.status_code == 200
    assert deleted.status_code == 403


async def test_admin_deletes(client: AsyncClient, board):
    tid = board.tasks["a"]["id"]

    assert (await client.delete(f"{board.url}/{tid}", headers=board.h["admin"])).status_code == 204
    assert (await client.get(f"{board.url}/{tid}", headers=board.h["admin"])).status_code == 404


async def test_outsider_gets_404(client: AsyncClient, board):
    assert (await client.get(board.url, headers=board.h["outsider"])).status_code == 404


# ---------------------------------------------------------------------------
# create and edit
# ---------------------------------------------------------------------------


async def test_create_defaults_and_creator(client: AsyncClient, board):
    body = (await client.post(board.url, json={"title": "fresh"}, headers=board.h["standard"])).json()

    assert body["status"] == "todo"
    assert body["priority"] == "medium"
    assert body["assignee"] is None
    assert body["created_by_id"] == board.ids["standard"]


async def test_assign_a_member(client: AsyncClient, board):
    body = (await client.post(
        board.url,
        json={"title": "assigned", "assignee_id": board.ids["viewer"]},
        headers=board.h["standard"],
    )).json()

    assert body["assignee"]["email"] == "viewer@example.com"
    assert set(body["assignee"]) == {"id", "email", "full_name"}


async def test_assigning_an_outsider_is_422(client: AsyncClient, board):
    response = await client.post(
        board.url,
        json={"title": "x", "assignee_id": board.ids["outsider"]},
        headers=board.h["standard"],
    )
    assert response.status_code == 422


async def test_edit_is_partial_and_status_is_ignored(client: AsyncClient, board):
    tid = board.tasks["a"]["id"]
    await client.patch(f"{board.url}/{tid}", json={"description": "keep"}, headers=board.h["admin"])

    body = (await client.patch(
        f"{board.url}/{tid}",
        json={"title": "renamed", "status": "done"},
        headers=board.h["admin"],
    )).json()

    assert body["title"] == "renamed"
    assert body["description"] == "keep"
    # status is not part of TaskUpdate, so it never reaches the task.
    assert body["status"] == "todo"


async def test_task_from_another_project_is_404(client: AsyncClient, board):
    other = (await client.post("/projects", json={"name": "Other"}, headers=board.h["admin"])).json()["id"]
    elsewhere = (await client.post(
        f"/projects/{other}/tasks", json={"title": "theirs"}, headers=board.h["admin"]
    )).json()["id"]

    assert (await client.get(f"{board.url}/{elsewhere}", headers=board.h["admin"])).status_code == 404


# ---------------------------------------------------------------------------
# moving
# ---------------------------------------------------------------------------


async def test_move_before_reorders_the_column(client: AsyncClient, board):
    response = await client.post(
        f"{board.url}/{board.tasks['c']['id']}/move",
        json={"before_task_id": board.tasks["a"]["id"]},
        headers=board.h["standard"],
    )

    assert response.status_code == 200
    assert await _titles(client, board) == ["c", "a", "b"]


async def test_move_to_another_column(client: AsyncClient, board):
    body = (await client.post(
        f"{board.url}/{board.tasks['b']['id']}/move",
        json={"status": "done"},
        headers=board.h["standard"],
    )).json()

    assert body["status"] == "done"
    todo = await client.get(f"{board.url}?status=todo", headers=board.h["viewer"])
    assert [t["title"] for t in todo.json()] == ["a", "c"]


async def test_move_against_a_task_in_another_column_is_422(client: AsyncClient, board):
    await client.post(
        f"{board.url}/{board.tasks['c']['id']}/move",
        json={"status": "done"},
        headers=board.h["admin"],
    )

    response = await client.post(
        f"{board.url}/{board.tasks['a']['id']}/move",
        json={"after_task_id": board.tasks["c"]["id"]},
        headers=board.h["admin"],
    )
    assert response.status_code == 422


async def test_both_anchors_at_once_is_rejected_by_the_schema(client: AsyncClient, board):
    response = await client.post(
        f"{board.url}/{board.tasks['a']['id']}/move",
        json={"before_task_id": board.tasks["b"]["id"], "after_task_id": board.tasks["c"]["id"]},
        headers=board.h["admin"],
    )
    assert response.status_code == 422
