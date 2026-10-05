import re
from datetime import timedelta
from unittest import mock

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from .models import ContactMessage
from .rules import MAX_ATTEMPTS
from .services import hash_code, new_code
from .views import ContactRateThrottle

VISITOR = 'visitor@example.com'
OWNER = 'owner@example.com'


def captcha(passes=True):
    """Stand-in for Cloudflare: the tests never call the real siteverify endpoint."""
    return mock.patch('contact.views.verify_turnstile', return_value=passes)


@override_settings(CONTACT_RECIPIENT_EMAIL=OWNER)
class ContactFlowTests(TestCase):
    def setUp(self):
        cache.clear()  # throttle counters live in the cache
        self.client = APIClient()

    def send(self, **overrides):
        data = {'email': VISITOR, 'message': 'Hello, I have a question.', 'captcha_token': 'token'}
        return self.client.post('/api/contact/', {**data, **overrides}, format='json')

    def verify(self, message_id, code):
        return self.client.post('/api/contact/verify/', {'id': message_id, 'code': code}, format='json')

    def start(self):
        """Send a message and return (id, the code that was emailed)."""
        with captcha():
            response = self.send()
        self.assertEqual(response.status_code, 201)
        code = re.search(r'\b(\d{6})\b', mail.outbox[-1].body).group(1)
        return response.json()['id'], code

    def wrong(self, code):
        return '000000' if code != '000000' else '111111'

    def test_full_flow_delivers_the_message(self):
        message_id, code = self.start()

        stored = ContactMessage.objects.get(id=message_id)
        self.assertEqual(stored.status, 'pending')
        self.assertEqual(mail.outbox[0].to, [VISITOR])
        self.assertNotIn(code, stored.code_hash)  # only the hash is kept
        self.assertEqual(stored.code_hash, hash_code(stored.id, code))

        response = self.verify(message_id, code)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'verified'})

        stored.refresh_from_db()
        self.assertEqual(stored.status, 'verified')
        forwarded = mail.outbox[1]
        self.assertEqual(forwarded.to, [OWNER])
        self.assertEqual(forwarded.reply_to, [VISITOR])
        self.assertNotEqual(forwarded.from_email, VISITOR)  # From is ours, never the visitor's
        self.assertIn('Hello, I have a question.', forwarded.body)

    def test_verifying_twice_does_not_send_twice(self):
        message_id, code = self.start()
        self.verify(message_id, code)
        self.assertEqual(self.verify(message_id, code).status_code, 200)
        self.assertEqual(len(mail.outbox), 2)

    def test_failed_captcha_stores_and_sends_nothing(self):
        with captcha(passes=False):
            response = self.send()
        self.assertEqual(response.status_code, 400)
        self.assertIn('captcha_token', response.json())
        self.assertEqual(ContactMessage.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_filled_honeypot_looks_like_success_but_does_nothing(self):
        with captcha() as check:
            response = self.send(website='https://spam.example')
        self.assertEqual(response.status_code, 201)
        self.assertIn('id', response.json())
        check.assert_not_called()
        self.assertEqual(ContactMessage.objects.count(), 0)
        self.assertEqual(len(mail.outbox), 0)

    def test_invalid_fields(self):
        with captcha():
            response = self.send(email='not-an-email', message='')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(set(response.json()), {'email', 'message'})

    def test_message_length_is_limited(self):
        with captcha():
            response = self.send(message='x' * 2001)
        self.assertEqual(response.status_code, 400)
        self.assertIn('message', response.json())

    def test_wrong_code_counts_down_then_invalidates(self):
        message_id, code = self.start()

        first = self.verify(message_id, self.wrong(code))
        self.assertEqual(first.status_code, 400)
        self.assertIn(f'{MAX_ATTEMPTS - 1} tries left', first.json()['code'][0])

        for _ in range(MAX_ATTEMPTS - 2):
            self.verify(message_id, self.wrong(code))
        last = self.verify(message_id, self.wrong(code))
        self.assertEqual(last.status_code, 410)
        self.assertEqual(last.json()['error'], 'too_many_attempts')

        # Even the right code is refused now, and nothing was forwarded
        self.assertEqual(self.verify(message_id, code).status_code, 410)
        self.assertEqual(ContactMessage.objects.get(id=message_id).status, 'expired')
        self.assertEqual(len(mail.outbox), 1)

    def test_expired_code(self):
        message_id, code = self.start()
        ContactMessage.objects.filter(id=message_id).update(expires_at=timezone.now() - timedelta(seconds=1))
        response = self.verify(message_id, code)
        self.assertEqual(response.status_code, 410)
        self.assertEqual(response.json()['error'], 'expired')
        self.assertEqual(ContactMessage.objects.get(id=message_id).status, 'expired')

    def test_unknown_message(self):
        response = self.verify('00000000-0000-4000-8000-000000000000', '123456')
        self.assertEqual(response.status_code, 404)

    def test_malformed_code(self):
        message_id, _ = self.start()
        response = self.verify(message_id, '12ab')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(ContactMessage.objects.get(id=message_id).attempts, 0)  # not counted as a try

    def test_sending_is_throttled_per_ip(self):
        with mock.patch.object(ContactRateThrottle, 'rate', '2/hour', create=True), captcha():
            statuses = [self.send().status_code for _ in range(3)]
        self.assertEqual(statuses, [201, 201, 429])

    def test_email_failure_is_503_and_leaves_no_pending_message(self):
        with captcha(), mock.patch('contact.views.services.send_code', side_effect=OSError('smtp down')):
            with self.assertLogs('contact.views', 'ERROR'):
                response = self.send()
        self.assertEqual(response.status_code, 503)
        self.assertEqual(ContactMessage.objects.count(), 0)


class CodeTests(TestCase):
    def test_codes_are_six_digits(self):
        for _ in range(50):
            self.assertRegex(new_code(), r'^\d{6}$')

    def test_hash_is_bound_to_the_message(self):
        self.assertNotEqual(hash_code('a', '123456'), hash_code('b', '123456'))
