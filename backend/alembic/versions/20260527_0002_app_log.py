"""Add app log table.

Revision ID: 20260527_0002
Revises: 20260527_0001
Create Date: 2026-05-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260527_0002"
down_revision: str | None = "20260527_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "app_log",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("level", sa.String(), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("manga_id", sa.String(), nullable=False),
        sa.Column("task_id", sa.String(), nullable=False),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_app_log_created_at", "app_log", ["created_at"])
    op.create_index("ix_app_log_event", "app_log", ["event"])
    op.create_index("ix_app_log_level", "app_log", ["level"])
    op.create_index("ix_app_log_manga_id", "app_log", ["manga_id"])
    op.create_index("ix_app_log_stage", "app_log", ["stage"])
    op.create_index("ix_app_log_task_id", "app_log", ["task_id"])


def downgrade() -> None:
    op.drop_index("ix_app_log_task_id", table_name="app_log")
    op.drop_index("ix_app_log_stage", table_name="app_log")
    op.drop_index("ix_app_log_manga_id", table_name="app_log")
    op.drop_index("ix_app_log_level", table_name="app_log")
    op.drop_index("ix_app_log_event", table_name="app_log")
    op.drop_index("ix_app_log_created_at", table_name="app_log")
    op.drop_table("app_log")
