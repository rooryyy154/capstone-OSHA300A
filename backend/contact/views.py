import logging
import smtplib
import uuid

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, throttle_classes
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from . import services
from .models import ContactMessage
from .rules import CODE_TTL, MAX_ATTEMPTS
from .serializers import ContactSerializer, VerifySerializer
from .turnstile import verify_turnstile

logger = logging.getLogger(__name__)

EMAIL_ERRORS = (smtplib.SMTPException, OSError)
EMAIL_UNAVAILABLE = {'detail': "We couldn't send the email right now. Please try again in a few minutes."}


class ContactRateThrottle(AnonRateThrottle):
    """Sending a message: a few per hour per IP (rate in settings, scope 'contact')."""

    scope = 'contact'


class ContactVerifyRateThrottle(AnonRateThrottle):
    """Entering codes: looser, because each message already allows only MAX_ATTEMPTS."""

    scope = 'contact_verify'


def pending_response(message_id, email):
    return Response(
        {'id': str(message_id), 'email': email, 'expires_in_minutes': int(CODE_TTL.total_seconds() // 60)},
        status=status.HTTP_201_CREATED,
    )


def gone(error, detail):
    return Response({'detail': detail, 'error': error}, status=status.HTTP_410_GONE)


@api_view(['POST'])
@throttle_classes([ContactRateThrottle])
def contact(request):
    """Step 1: check the captcha and the fields, store the message as pending, email the code."""
    serializer = ContactSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    # A filled honeypot gets the same answer as a real visitor, so the bot learns nothing
    if data.get('website'):
        return pending_response(uuid.uuid4(), data['email'])

    if not verify_turnstile(data.get('captcha_token'), request.META.get('REMOTE_ADDR')):
        return Response(
            {'captcha_token': ["We couldn't confirm you're not a robot. Please complete the check again."]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    message, code = services.create_pending(data['email'], data['message'])
    try:
        services.send_code(message, code)
    except EMAIL_ERRORS:
        logger.exception('Could not send the verification code')
        message.delete()
        return Response(EMAIL_UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    return pending_response(message.id, message.email)


@api_view(['POST'])
@throttle_classes([ContactVerifyRateThrottle])
def verify(request):
    """Step 2: check the code and, if it's right, forward the message to the site owner."""
    serializer = VerifySerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    with transaction.atomic():
        # Locked so two requests can't both spend the same attempt
        message = ContactMessage.objects.select_for_update().filter(id=data['id']).first()
        if message is None:
            return Response(
                {'detail': "We couldn't find that message. Please send it again.", 'error': 'not_found'},
                status=status.HTTP_404_NOT_FOUND,
            )
        if message.status == ContactMessage.Status.VERIFIED:
            return Response({'status': 'verified'})
        if message.attempts >= MAX_ATTEMPTS:
            return gone('too_many_attempts', 'Too many wrong codes. Please send your message again to get a new code.')
        if message.status == ContactMessage.Status.EXPIRED or timezone.now() >= message.expires_at:
            message.status = ContactMessage.Status.EXPIRED
            message.save(update_fields=['status'])
            return gone('expired', 'That code has expired. Please send your message again to get a new one.')

        if not services.code_matches(message, data['code']):
            message.attempts += 1
            left = MAX_ATTEMPTS - message.attempts
            if left == 0:
                message.status = ContactMessage.Status.EXPIRED
            message.save(update_fields=['attempts', 'status'])
            if left == 0:
                return gone('too_many_attempts', 'Too many wrong codes. Please send your message again to get a new code.')
            return Response(
                {'code': [f"That code isn't right. You have {left} {'try' if left == 1 else 'tries'} left."]},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            services.forward(message)
        except EMAIL_ERRORS:
            # Nothing is changed, so the visitor can submit the same code again
            logger.exception('Could not forward a verified contact message')
            return Response(EMAIL_UNAVAILABLE, status=status.HTTP_503_SERVICE_UNAVAILABLE)

        message.status = ContactMessage.Status.VERIFIED
        message.save(update_fields=['status'])

    return Response({'status': 'verified'})
