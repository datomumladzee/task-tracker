from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class IntakeDraft(Base):
    """A parsed sentence waiting to be confirmed into a real task.

    Stored rather than sent back and forth, so the client never gets to edit
    what the model said: confirm loads the draft from here and the user can
    only change the fields they are allowed to.
    """

    __tablename__ = "task_drafts"

    id: Mapped[int] = mapped_column(primary_key=True)

    # A draft belongs to whoever typed it. Lookups always filter on this, so
    # another user's draft id reads as missing.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )

    # The sentence exactly as typed. Kept so nothing the user wrote is lost,
    # even if the model fails or the draft is never confirmed.
    text: Mapped[str] = mapped_column(Text)

    # The TaskDraft the model returned, as JSON. JSONB rather than a column
    # per field: the draft is read and written whole, never queried by field,
    # and its shape can change without a migration.
    draft: Mapped[dict] = mapped_column(JSONB)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    # Set together when the draft becomes a task. confirmed_at is what blocks
    # a second confirm. task_id can later go null if the task is deleted, but
    # confirmed_at stays, so a deleted task cannot be resurrected by
    # confirming the same draft again.
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        default=None,
    )
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"),
        default=None,
    )

    def __repr__(self) -> str:
        return f"<IntakeDraft id={self.id} user={self.user_id} confirmed={self.confirmed_at is not None}>"
