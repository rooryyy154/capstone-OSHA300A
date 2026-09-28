from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

from core.models import CohortStats, NaicsIndustry
from core.naics import normalize_naics
from core.rules import ALL

from .benchmark import NoDataLoaded, YearNotLoaded, resolve_year, run_benchmark
from .serializers import BenchmarkInputSerializer

NO_DATA = {'detail': 'No OSHA data is loaded yet. Run: python manage.py load_ita --file <csv>'}


@api_view(['GET'])
def health(request):
    """Lightweight endpoint the frontend uses to confirm it can reach the API."""
    return Response({'status': 'ok'})


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
    """NAICS search for the form: ?q= a code prefix or words from the label."""
    query = request.query_params.get('q', '').strip()
    try:
        limit = min(max(int(request.query_params.get('limit', 20)), 1), 50)
    except ValueError:
        limit = 20

    matches = NaicsIndustry.objects.all()
    if query.isdigit():
        matches = matches.filter(code__startswith=normalize_naics(query) if len(query) == 6 else query)
    elif query:
        matches = matches.filter(label__icontains=query)
    matches = list(matches[:limit])

    try:
        year = resolve_year(None)
    except NoDataLoaded:
        return Response(NO_DATA, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    counts = dict(
        CohortStats.objects.filter(year=year, ownership=ALL, level=6, naics_prefix__in=[m.code for m in matches])
        .values_list('naics_prefix', 'establishment_count')
    )
    return Response([
        {'code': m.code, 'label': m.label, 'establishment_count': counts.get(m.code, 0)} for m in matches
    ])
