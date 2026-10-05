import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)

VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
TIMEOUT_SECONDS = 5


def verify_turnstile(token, remote_ip=None):
    """Ask Cloudflare whether a Turnstile token is genuine. True only on an explicit success.

    The widget in the browser can be faked, so the token counts for nothing until Cloudflare
    confirms it with our secret key. Anything else fails closed: no secret configured, no
    token, Cloudflare unreachable, or an answer we can't read.
    """
    secret = settings.TURNSTILE_SECRET_KEY
    if not secret or not token:
        return False

    fields = {'secret': secret, 'response': token}
    if remote_ip:
        fields['remoteip'] = remote_ip
    request = urllib.request.Request(VERIFY_URL, data=urllib.parse.urlencode(fields).encode())

    try:
        with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            result = json.load(response)
    except (urllib.error.URLError, TimeoutError, ValueError):
        logger.warning('Turnstile verification could not be completed', exc_info=True)
        return False

    if not result.get('success'):
        logger.info('Turnstile rejected a token: %s', result.get('error-codes'))
    return result.get('success') is True
