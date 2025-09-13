"""users and subscriptions

Revision ID: 721b0bb67f76
Revises: 91854c854fe7
Create Date: 2025-09-10 00:33:40.633167+00:00

"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "721b0bb67f76"
down_revision = "91854c854fe7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Text(), primary_key=True),  # store Supabase user_id as text
        sa.Column("email", sa.Text(), nullable=False, unique=True),
        sa.Column(
            "auth_provider_id", sa.Text(), unique=True
        ),  # optional, e.g. provider uid
        sa.Column("stripe_customer_id", sa.Text()),  # set via webhook
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )

    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Text(), primary_key=True),  # Stripe subscription id
        sa.Column(
            "user_id",
            sa.Text(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "status", sa.Text(), nullable=False
        ),  # active | trialing | canceled | past_due ...
        sa.Column("price_id", sa.Text(), nullable=False),  # Stripe price id
        sa.Column("plan", sa.Text(), nullable=False),  # e.g. monthly
        sa.Column("current_period_end", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.text("CURRENT_TIMESTAMP"),
            nullable=False,
        ),
    )
    op.create_index("ix_subscriptions_user_id", "subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_subscriptions_user_id", table_name="subscriptions")
    op.drop_table("subscriptions")
    op.drop_table("users")
