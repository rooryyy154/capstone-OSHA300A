"""Limits for the contact form. Each one is a decision recorded in docs/decisions.md (D-010)."""

from datetime import timedelta

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=15)  # how long the emailed code stays valid
MAX_ATTEMPTS = 5  # wrong codes before the message is invalidated
MESSAGE_MAX_LENGTH = 2000

# Retention: how long stored messages are kept. A verified message has already been emailed to
# the site owner, so the database copy is only a short safety net.
UNVERIFIED_RETENTION = timedelta(days=1)  # pending or expired, counted from the code's expiry
VERIFIED_RETENTION = timedelta(days=30)  # counted from when the message was sent
