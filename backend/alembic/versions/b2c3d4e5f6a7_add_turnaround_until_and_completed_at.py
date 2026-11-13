"""add_turnaround_until_and_completed_at

Revision ID: b2c3d4e5f6a7
Revises: 06ba08b6726f
Create Date: 2026-11-13 19:40:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = '06ba08b6726f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add turnaround_until to trucks and completed_at to trips."""
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    truck_cols = [c['name'] for c in inspector.get_columns('trucks')]
    if 'turnaround_until' not in truck_cols:
        with op.batch_alter_table('trucks', schema=None) as batch_op:
            batch_op.add_column(sa.Column('turnaround_until', sa.String(length=50), nullable=True))

    trip_cols = [c['name'] for c in inspector.get_columns('trips')]
    if 'completed_at' not in trip_cols:
        with op.batch_alter_table('trips', schema=None) as batch_op:
            batch_op.add_column(sa.Column('completed_at', sa.String(length=50), nullable=True))


def downgrade() -> None:
    """Remove turnaround_until and completed_at."""
    with op.batch_alter_table('trips', schema=None) as batch_op:
        batch_op.drop_column('completed_at')

    with op.batch_alter_table('trucks', schema=None) as batch_op:
        batch_op.drop_column('turnaround_until')
