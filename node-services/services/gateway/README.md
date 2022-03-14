# Gateway Service

Main entry point for HTTP requests.  Routes to the following services

 - /api/.*  -> Elastic Search Rest API service
 - /auth/.* -> Authentication service
 - /fuseki/.* -> Main Fuseki dataset query service
 - All other requests route to client service

# Env Config

 - GATEWAY_PORT: Internal port to run gateway service on
 - AUTH_SERVICE_HOST: Full protocol and hostname for authentication service.  Defaults to: http://auth:3000
 - CLIENT_SERVICE_HOST: Full protocol and hostname for client service.  Defaults to: http://client:3000
 - API_SERVICE_HOST: Full protocol and hostname for api service.  Defaults to: http://api:3000
 - FUSEKI_HOST: hostname of Fuseki service. Defaults to: fuseki
 - FUSEKI_PORT: port of Fuseki service: Defaults to: 3030
 - FUSEKI_DATABASE: Main Fuseki dataset to use. Defaults to: vivo
