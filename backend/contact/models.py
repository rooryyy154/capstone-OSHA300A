import uuid

from django.db import models


class ContactMessage(models.Model):
    """A message a visitor sends through the contact form (docs/decisions.md, D-010).

    It is stored as `pending` until the visitor proves the email address is theirs by entering
    the 6-digit code we emailed them. Only the hash of that code is kept. This is the only
    table in the project that visitors can write to, and nothing in it can be read back
    through the API.
    """

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        VERIFIED = 'verified', 'Verified'
        EXPIRED = 'expired', 'Expired'

    # A UUID, not a counter: the frontend holds this id between the two steps, and it must
    # not be guessable
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField()
    message = models.TextField()
    code_hash = models.CharField(max_length=128)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    attempts = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    class Meta:
        db_table = 'contact_message'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.email} ({self.status}, {self.created_at:%Y-%m-%d})'
