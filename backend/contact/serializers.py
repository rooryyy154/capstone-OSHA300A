from rest_framework import serializers

from .rules import CODE_LENGTH, MESSAGE_MAX_LENGTH


class ContactSerializer(serializers.Serializer):
    email = serializers.EmailField(max_length=254)
    message = serializers.CharField(max_length=MESSAGE_MAX_LENGTH)
    captcha_token = serializers.CharField(required=False, allow_blank=True, max_length=4096)
    # Honeypot: hidden from people with CSS, so only a bot fills it in
    website = serializers.CharField(required=False, allow_blank=True, max_length=255)


class VerifySerializer(serializers.Serializer):
    id = serializers.UUIDField()
    code = serializers.RegexField(
        rf'^\d{{{CODE_LENGTH}}}$',
        error_messages={'invalid': f'Enter the {CODE_LENGTH}-digit code from the email.'},
    )
