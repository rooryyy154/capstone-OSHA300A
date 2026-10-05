"""Verification codes and the two emails behind the contact form."""

import secrets

from django.conf import settings
from django.core.mail import EmailMessage, send_mail
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac

from .models import ContactMessage
from .rules import CODE_LENGTH, CODE_TTL


def new_code():
    """A random 6-digit code, zero-padded ('004217'), from the OS's secure random source."""
    return f'{secrets.randbelow(10 ** CODE_LENGTH):0{CODE_LENGTH}d}'


def hash_code(message_id, code):
    """Keyed hash of the code, bound to its message.

    Keyed with SECRET_KEY: a 6-digit code has only a million possibilities, so a plain hash
    could be reversed by anyone who read the table. With the key, the table alone isn't enough.
    """
    return salted_hmac('contact.code', f'{message_id}:{code}', algorithm='sha256').hexdigest()


def code_matches(message, code):
    return constant_time_compare(message.code_hash, hash_code(message.id, code))


def create_pending(email, text):
    """Store the message as pending and return it with its (unstored) code."""
    code = new_code()
    message = ContactMessage(email=email, message=text, expires_at=timezone.now() + CODE_TTL)
    message.code_hash = hash_code(message.id, code)
    message.save()
    return message, code


def send_code(message, code):
    """Email the verification code to the visitor."""
    minutes = int(CODE_TTL.total_seconds() // 60)
    send_mail(
        'Your PlantLine verification code',
        (
            f'Your verification code is {code}\n\n'
            f'Enter it on the PlantLine contact page to send your message. '
            f'The code expires in {minutes} minutes.\n\n'
            "If you didn't write to PlantLine, you can ignore this email."
        ),
        None,  # DEFAULT_FROM_EMAIL: our own address, never the visitor's
        [message.email],
    )


def forward(message):
    """Email a verified message to the site owner, with the visitor in Reply-To."""
    if not settings.CONTACT_RECIPIENT_EMAIL:
        raise RuntimeError('CONTACT_RECIPIENT_EMAIL is not set')
    EmailMessage(
        f'PlantLine contact: message from {message.email}',
        (
            'New message from the PlantLine contact form.\n\n'
            f'From: {message.email} (address verified)\n'
            f'Sent: {message.created_at:%Y-%m-%d %H:%M} UTC\n\n'
            f'{message.message}'
        ),
        None,
        [settings.CONTACT_RECIPIENT_EMAIL],
        reply_to=[message.email],
    ).send()
