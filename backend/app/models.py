"""Every model, imported in one place.

A model only registers on Base.metadata when its module is imported. Three
things depend on that registry being complete:

- Alembic autogenerate, which diffs it against the database
- Base.metadata.create_all in the test fixtures
- relationships named by string, like Project.tasks = relationship("Task"),
  which SQLAlchemy resolves only once both classes are registered

Importing each model separately in each of those places means three lists that
drift apart. main.py and migrations/env.py both import this module instead, so
adding a model means adding one line here.
"""

from app.projects.models import Project, ProjectMember, ProjectRole
from app.tasks.models import Comment, Task, TaskPriority, TaskStatus
from app.users.models import User, UserRole

__all__ = [
    "Comment",
    "Project",
    "ProjectMember",
    "ProjectRole",
    "Task",
    "TaskPriority",
    "TaskStatus",
    "User",
    "UserRole",
]
