from django.urls import path

from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('years/', views.years, name='years'),
    path('benchmark/', views.benchmark, name='benchmark'),
    path('industries/', views.industries, name='industries'),
    path('insights/', views.insights, name='insights'),
]
