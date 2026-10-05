import logging

from django.db import DatabaseError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

logger = logging.getLogger(__name__)


def api_exception_handler(exc, context):
    """Every API error is JSON with a status code, never Django's HTML error page.

    DRF already handles its own exceptions (validation, throttling, 404...). What's left is
    unexpected: a database that is down or unreachable becomes 503, anything else 500. The
    traceback still goes to the server log.
    """
    response = exception_handler(exc, context)
    if response is not None:
        return response

    view = context['view'].__class__.__name__
    if isinstance(exc, DatabaseError):
        logger.exception('Database error in %s', view)
        return Response({'detail': 'The database is unavailable.'}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    logger.exception('Unhandled error in %s', view)
    return Response({'detail': 'Internal server error.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
