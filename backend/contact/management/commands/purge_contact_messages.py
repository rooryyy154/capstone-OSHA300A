from django.core.management.base import BaseCommand

from contact.services import purge_old_messages


class Command(BaseCommand):
    help = 'Delete contact messages past their retention period. Also runs on every new submission.'

    def handle(self, *args, **options):
        deleted = purge_old_messages()
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} old contact message(s).'))
