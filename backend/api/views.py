from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.models import CohortStats, NaicsIndustry
from core.naics import normalize_naics
from core.rules import ALL

from .benchmark import NoDataLoaded, YearNotLoaded, resolve_year, run_benchmark
from .insights import get_insights
from .serializers import BenchmarkInputSerializer

NO_DATA = {'detail': 'No OSHA data is loaded yet. Run: python manage.py load_ita --file <csv>'}


def year_from(request):
    """The ?year= query parameter, defaulting to the latest loaded year.

    Returns (year, None) or (None, error_response).
    """
    raw = request.query_params.get('year')
    try:
        return resolve_year(int(raw) if raw else None), None
    except ValueError:
        return None, Response({'detail': 'year must be a number.'}, status=status.HTTP_400_BAD_REQUEST)
    except NoDataLoaded:
        return None, Response(NO_DATA, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except YearNotLoaded as error:
        return None, Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
def health(request):
    """Lightweight endpoint the frontend uses to confirm it can reach the API."""
    return Response({'status': 'ok'})


@api_view(['GET'])
def years(request):
    """The report years loaded in the database, newest first, for the year selector."""
    loaded = list(CohortStats.objects.order_by('-year').values_list('year', flat=True).distinct())
    return Response({'years': loaded, 'latest': loaded[0] if loaded else None})


@api_view(['POST'])
def benchmark(request):
    """Calculate the plant's TRIR and compare it with its industry peers. Writes nothing."""
    serializer = BenchmarkInputSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    try:
        result = run_benchmark(**serializer.validated_data)
    except NoDataLoaded:
        return Response(NO_DATA, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    except YearNotLoaded as error:
        return Response({'detail': str(error)}, status=status.HTTP_400_BAD_REQUEST)
    return Response(result)


@api_view(['GET'])
def industries(request):
    """NAICS search for the form: ?q= a code prefix or words from the label, ?year= for the plant counts."""
    query = request.query_params.get('q', '').strip()
    try:
        limit = min(max(int(request.query_params.get('limit', 20)), 1), 50)
    except ValueError:
        limit = 20

    year, error = year_from(request)
    if error:
        return error

    matches = NaicsIndustry.objects.all()
    if query.isdigit():
        matches = matches.filter(code__startswith=normalize_naics(query) if len(query) == 6 else query)
    elif query:
        matches = matches.filter(label__icontains=query)
    matches = list(matches[:limit])

    counts = dict(
        CohortStats.objects.filter(year=year, ownership=ALL, level=6, naics_prefix__in=[m.code for m in matches])
        .values_list('naics_prefix', 'establishment_count')
    )
    return Response([
        {'code': m.code, 'label': m.label, 'establishment_count': counts.get(m.code, 0)} for m in matches
    ])


@api_view(['GET'])
def insights(request):
    """Headline figures for the landing page: totals, sectors, plant size, ownership, industries."""
    year, error = year_from(request)
    if error:
        return error
    return Response(get_insights(year))
