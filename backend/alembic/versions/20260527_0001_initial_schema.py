"""Initial schema.

Revision ID: 20260527_0001
Revises:
Create Date: 2026-05-27
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "20260527_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "download_task",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("manga_id", sa.String(), nullable=False),
        sa.Column("source", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("stage", sa.String(), nullable=False),
        sa.Column("progress_current", sa.Integer(), nullable=False),
        sa.Column("progress_total", sa.Integer(), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_download_task_manga_id", "download_task", ["manga_id"])
    op.create_index("ix_download_task_stage", "download_task", ["stage"])
    op.create_index("ix_download_task_status", "download_task", ["status"])

    op.create_table(
        "download_file",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("manga_id", sa.String(), nullable=False),
        sa.Column("pic_index", sa.Integer(), nullable=False),
        sa.Column("file_path", sa.String(), nullable=False),
        sa.Column("file_name", sa.String(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manga_id", "pic_index"),
    )
    op.create_index("ix_download_file_manga_id", "download_file", ["manga_id"])
    op.create_index("ix_download_file_status", "download_file", ["status"])

    op.create_table(
        "manga_info",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("cover_url", sa.String(), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False),
        sa.Column("pic_count", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_manga_info_status", "manga_info", ["status"])

    op.create_table(
        "manga_page",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("manga_id", sa.String(), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("page_url", sa.String(), nullable=False),
        sa.Column("page_name", sa.String(), nullable=False),
        sa.Column("page_context", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manga_id", "page_index"),
        sa.UniqueConstraint("page_name"),
    )
    op.create_index("ix_manga_page_manga_id", "manga_page", ["manga_id"])
    op.create_index("ix_manga_page_status", "manga_page", ["status"])

    op.create_table(
        "manga_pic_page",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("manga_id", sa.String(), nullable=False),
        sa.Column("page_index", sa.Integer(), nullable=False),
        sa.Column("page_url", sa.String(), nullable=False),
        sa.Column("page_name", sa.String(), nullable=False),
        sa.Column("pic_index", sa.Integer(), nullable=False),
        sa.Column("pic_num", sa.String(), nullable=False),
        sa.Column("pic_url", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("manga_id", "page_index"),
    )
    op.create_index("ix_manga_pic_page_manga_id", "manga_pic_page", ["manga_id"])
    op.create_index("ix_manga_pic_page_status", "manga_pic_page", ["status"])


def downgrade() -> None:
    op.drop_index("ix_manga_pic_page_status", table_name="manga_pic_page")
    op.drop_index("ix_manga_pic_page_manga_id", table_name="manga_pic_page")
    op.drop_table("manga_pic_page")

    op.drop_index("ix_manga_page_status", table_name="manga_page")
    op.drop_index("ix_manga_page_manga_id", table_name="manga_page")
    op.drop_table("manga_page")

    op.drop_index("ix_manga_info_status", table_name="manga_info")
    op.drop_table("manga_info")

    op.drop_index("ix_download_file_status", table_name="download_file")
    op.drop_index("ix_download_file_manga_id", table_name="download_file")
    op.drop_table("download_file")

    op.drop_index("ix_download_task_status", table_name="download_task")
    op.drop_index("ix_download_task_stage", table_name="download_task")
    op.drop_index("ix_download_task_manga_id", table_name="download_task")
    op.drop_table("download_task")
