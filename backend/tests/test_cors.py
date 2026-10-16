from httpx import AsyncClient

FRONTEND = "http://localhost:3000"


async def test_the_frontend_origin_is_allowed(client: AsyncClient):
    response = await client.get("/health", headers={"Origin": FRONTEND})

    assert response.headers["access-control-allow-origin"] == FRONTEND


async def test_other_sites_are_not_allowed(client: AsyncClient):
    """No allow-origin header means the browser refuses to hand the response
    to that site's JavaScript."""
    response = await client.get("/health", headers={"Origin": "http://evil.example"})

    assert "access-control-allow-origin" not in response.headers


async def test_preflight_allows_the_bearer_header(client: AsyncClient):
    """A request with Authorization is not "simple", so the browser asks first
    with OPTIONS. If this fails, every logged-in call from the frontend does."""
    response = await client.options(
        "/users/me",
        headers={
            "Origin": FRONTEND,
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )

    assert response.status_code == 200
    assert "authorization" in response.headers["access-control-allow-headers"].lower()


async def test_retry_after_and_www_authenticate_are_readable(client: AsyncClient):
    response = await client.get("/health", headers={"Origin": FRONTEND})

    exposed = response.headers["access-control-expose-headers"].lower()
    assert "retry-after" in exposed
    assert "www-authenticate" in exposed
