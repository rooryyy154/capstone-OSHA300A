"""Limits for the contact form. Each one is a decision recorded in docs/decisions.md (D-010)."""

from datetime import timedelta

CODE_LENGTH = 6
CODE_TTL = timedelta(minutes=15)  # how long the emailed code stays valid
MAX_ATTEMPTS = 5  # wrong codes before the message is invalidated
MESSAGE_MAX_LENGTH = 2000
