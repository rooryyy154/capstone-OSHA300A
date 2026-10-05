from django.urls import path

from . import views

urlpatterns = [
    path('', views.contact, name='contact'),
    path('verify/', views.verify, name='contact-verify'),
]
