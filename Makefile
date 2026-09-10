# Shortcuts so we don't have to type long docker commands every time.
# Run any of these with: make <name>, e.g. "make dev"

.PHONY: dev stop logs test backend-shell db-shell

# Builds the images (if needed) and starts backend + database containers.
dev:
	docker compose up --build

# Stops and removes the running containers.
stop:
	docker compose down

# Streams live logs from all running containers, useful for debugging.
logs:
	docker compose logs -f

# Runs the test suite inside the backend container.
# Needs the containers up, since it creates a tracker_test database on the
# same Postgres and drops it again at the end.
test:
	docker compose exec backend pytest

# Opens a terminal inside the running backend container.
# Useful for running one-off commands (like Alembic migrations) later.
backend-shell:
	docker compose exec backend bash

# Opens a direct SQL prompt inside the running database container.
db-shell:
	docker compose exec db psql -U tracker -d tracker
