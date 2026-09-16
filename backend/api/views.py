from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(['GET'])
def health(request):
    """Lightweight endpoint the frontend uses to confirm it can reach the API."""
    return Response({'status': 'ok'})
