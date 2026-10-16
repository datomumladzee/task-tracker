"""Projects and members through real HTTP.

The service tests prove the logic. These prove the wiring: that each endpoint
has the right permission attached and turns each error into the right code.
"""

from types import SimpleNamespace

import pytest
from httpx import AsyncClient


@pytest.fixture
async def team(client: AsyncClient, auth_headers):
    """One project with an admin, a standard member and a viewer, plus an
    outsider who belongs to nothing."""
    headers, ids = {}, {}
    for who in ("admin", "standard", "viewer", "outsider"):
        headers[who] = await auth_headers(f"{who}@example.com")
        ids[who] = (await client.get("/users/me", headers=headers[who])).json()["id"]

    created = await client.post("/projects", json={"name": "Team"}, headers=headers["admin"])
    pid = created.json()["id"]

    for who in ("standard", "viewer"):
        await client.post(
            f"/projects/{pid}/members",
            json={"email": f"{who}@example.com", "role": who},
            headers=headers["admin"],
        )

    return SimpleNamespace(pid=pid, h=headers, ids=ids)


# ---------------------------------------------------------------------------
# projects
# ---------------------------------------------------------------------------


async def test_create_project_and_become_admin(client: AsyncClient, auth_headers):
    headers = await auth_headers("new@example.com")

    created = await client.post("/projects", json={"name": "Mine"}, headers=headers)
    assert created.status_code == 201

    [item] = (await client.get("/projects", headers=headers)).json()
    assert item["name"] == "Mine"
    assert item["role"] == "admin"


async def test_create_requires_login(client: AsyncClient):
    assert (await client.post("/projects", json={"name": "X"})).status_code == 401


async def test_create_rejects_a_blank_name(client: AsyncClient, auth_headers):
    headers = await auth_headers()
    response = await client.post("/projects", json={"name": "   "}, headers=headers)
    assert response.status_code == 422


async def test_list_shows_only_your_projects(client: AsyncClient, team):
    await client.post("/projects", json={"name": "Private"}, headers=team.h["outsider"])

    names = [p["name"] for p in (await client.get("/projects", headers=team.h["viewer"])).json()]

    assert names == ["Team"]


async def test_outsider_gets_404_not_403(client: AsyncClient, team):
    response = await client.get(f"/projects/{team.pid}", headers=team.h["outsider"])
    assert response.status_code == 404


async def test_viewer_can_read_but_not_edit(client: AsyncClient, team):
    url = f"/projects/{team.pid}"

    assert (await client.get(url, headers=team.h["viewer"])).status_code == 200
    assert (await client.patch(url, json={"name": "X"}, headers=team.h["viewer"])).status_code == 403


async def test_standard_cannot_edit_or_delete(client: AsyncClient, team):
    url = f"/projects/{team.pid}"

    assert (await client.patch(url, json={"name": "X"}, headers=team.h["standard"])).status_code == 403
    assert (await client.delete(url, headers=team.h["standard"])).status_code == 403


async def test_admin_edits_only_what_was_sent(client: AsyncClient, team):
    url = f"/projects/{team.pid}"
    await client.patch(url, json={"description": "keep"}, headers=team.h["admin"])

    body = (await client.patch(url, json={"name": "Renamed"}, headers=team.h["admin"])).json()

    assert body["name"] == "Renamed"
    assert body["description"] == "keep"


async def test_null_description_clears_it_but_null_name_is_rejected(client: AsyncClient, team):
    url = f"/projects/{team.pid}"
    await client.patch(url, json={"description": "remove me"}, headers=team.h["admin"])

    cleared = await client.patch(url, json={"description": None}, headers=team.h["admin"])
    null_name = await client.patch(url, json={"name": None}, headers=team.h["admin"])

    assert cleared.json()["description"] is None
    assert null_name.status_code == 422


async def test_admin_deletes_and_it_is_gone(client: AsyncClient, team):
    url = f"/projects/{team.pid}"

    assert (await client.delete(url, headers=team.h["admin"])).status_code == 204
    assert (await client.get(url, headers=team.h["admin"])).status_code == 404


# ---------------------------------------------------------------------------
# members
# ---------------------------------------------------------------------------


async def test_member_list_shows_only_safe_user_fields(client: AsyncClient, team):
    members = (await client.get(f"/projects/{team.pid}/members", headers=team.h["viewer"])).json()

    assert len(members) == 3
    for m in members:
        assert set(m["user"]) == {"id", "email", "full_name"}


async def test_standard_cannot_add_members(client: AsyncClient, team):
    response = await client.post(
        f"/projects/{team.pid}/members",
        json={"email": "outsider@example.com"},
        headers=team.h["standard"],
    )
    assert response.status_code == 403


async def test_add_unknown_email_is_404(client: AsyncClient, team):
    response = await client.post(
        f"/projects/{team.pid}/members",
        json={"email": "ghost@example.com"},
        headers=team.h["admin"],
    )
    assert response.status_code == 404


async def test_add_existing_member_is_409(client: AsyncClient, team):
    response = await client.post(
        f"/projects/{team.pid}/members",
        json={"email": "viewer@example.com"},
        headers=team.h["admin"],
    )
    assert response.status_code == 409


async def test_admin_changes_a_role(client: AsyncClient, team):
    response = await client.patch(
        f"/projects/{team.pid}/members/{team.ids['viewer']}",
        json={"role": "standard"},
        headers=team.h["admin"],
    )

    assert response.status_code == 200
    assert response.json()["role"] == "standard"


async def test_last_admin_cannot_demote_themselves(client: AsyncClient, team):
    response = await client.patch(
        f"/projects/{team.pid}/members/{team.ids['admin']}",
        json={"role": "viewer"},
        headers=team.h["admin"],
    )
    assert response.status_code == 409


# ---------------------------------------------------------------------------
# removing and leaving
# ---------------------------------------------------------------------------


async def test_anyone_can_leave(client: AsyncClient, team):
    url = f"/projects/{team.pid}/members/{team.ids['viewer']}"

    assert (await client.delete(url, headers=team.h["viewer"])).status_code == 204
    # Gone, so the project now looks like it does not exist.
    assert (await client.get(f"/projects/{team.pid}", headers=team.h["viewer"])).status_code == 404


async def test_non_admin_cannot_remove_someone_else(client: AsyncClient, team):
    url = f"/projects/{team.pid}/members/{team.ids['viewer']}"
    assert (await client.delete(url, headers=team.h["standard"])).status_code == 403


async def test_admin_removes_someone_else(client: AsyncClient, team):
    url = f"/projects/{team.pid}/members/{team.ids['standard']}"
    assert (await client.delete(url, headers=team.h["admin"])).status_code == 204


async def test_last_admin_cannot_leave(client: AsyncClient, team):
    url = f"/projects/{team.pid}/members/{team.ids['admin']}"
    assert (await client.delete(url, headers=team.h["admin"])).status_code == 409


async def test_removing_a_non_member_is_404(client: AsyncClient, team):
    url = f"/projects/{team.pid}/members/{team.ids['outsider']}"
    assert (await client.delete(url, headers=team.h["admin"])).status_code == 404


# ---------------------------------------------------------------------------
# leaving a project gives back its tasks
# ---------------------------------------------------------------------------


async def _task(client, team, pid, title, who="admin", **fields):
    return (await client.post(
        f"/projects/{pid}/tasks", json={"title": title, **fields}, headers=team.h[who]
    )).json()


async def _get_task(client, team, pid, tid):
    return (await client.get(f"/projects/{pid}/tasks/{tid}", headers=team.h["admin"])).json()


async def test_removing_a_member_unassigns_their_tasks_here_only(client: AsyncClient, team):
    """Their tasks in this project lose the assignee. What they created, what
    they wrote, and their tasks in another project are left alone."""
    assigned = await _task(client, team, team.pid, "theirs", assignee_id=team.ids["standard"])
    created = await _task(client, team, team.pid, "made by them", who="standard", assignee_id=team.ids["admin"])
    comment_url = f"/projects/{team.pid}/tasks/{assigned['id']}/comments"
    await client.post(comment_url, json={"body": "said by them"}, headers=team.h["standard"])

    other = (await client.post("/projects", json={"name": "Other"}, headers=team.h["admin"])).json()["id"]
    await client.post(f"/projects/{other}/members", json={"email": "standard@example.com"}, headers=team.h["admin"])
    elsewhere = await _task(client, team, other, "theirs elsewhere", assignee_id=team.ids["standard"])

    response = await client.delete(f"/projects/{team.pid}/members/{team.ids['standard']}", headers=team.h["admin"])
    assert response.status_code == 204

    assert (await _get_task(client, team, team.pid, assigned["id"]))["assignee"] is None
    kept = await _get_task(client, team, team.pid, created["id"])
    assert kept["created_by_id"] == team.ids["standard"]
    assert kept["assignee"]["id"] == team.ids["admin"]
    comments = (await client.get(comment_url, headers=team.h["admin"])).json()
    assert [c["author"]["id"] for c in comments] == [team.ids["standard"]]
    assert (await _get_task(client, team, other, elsewhere["id"]))["assignee"]["id"] == team.ids["standard"]


async def test_leaving_yourself_unassigns_your_tasks(client: AsyncClient, team):
    task = await _task(client, team, team.pid, "mine", assignee_id=team.ids["viewer"])

    response = await client.delete(f"/projects/{team.pid}/members/{team.ids['viewer']}", headers=team.h["viewer"])
    assert response.status_code == 204

    assert (await _get_task(client, team, team.pid, task["id"]))["assignee"] is None


async def test_a_refused_last_admin_removal_touches_no_task(client: AsyncClient, team):
    task = await _task(client, team, team.pid, "admin's", assignee_id=team.ids["admin"])

    response = await client.delete(f"/projects/{team.pid}/members/{team.ids['admin']}", headers=team.h["admin"])
    assert response.status_code == 409

    assert (await _get_task(client, team, team.pid, task["id"]))["assignee"]["id"] == team.ids["admin"]


# ---------------------------------------------------------------------------
# your role on one project
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("who", ["admin", "standard", "viewer"])
async def test_get_one_project_includes_your_role(client: AsyncClient, team, who):
    response = await client.get(f"/projects/{team.pid}", headers=team.h[who])

    assert response.status_code == 200
    assert response.json()["role"] == who


async def test_creating_a_project_returns_role_admin(client: AsyncClient, auth_headers):
    headers = await auth_headers("maker@example.com")

    response = await client.post("/projects", json={"name": "Mine"}, headers=headers)

    assert response.status_code == 201
    assert response.json()["role"] == "admin"
