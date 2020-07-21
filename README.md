# VESSEL
Vivo schema + fusEki + elaStic Search; rEsearch profiLes

VESSEL contains the core services for the UC Davis Library - Research Profile implementation.

You can see the architecture diagram here:
https://docs.google.com/drawings/d/1TvNR2_PHlqCFE6ptN4bmAiF3V9OxUWFaNqtkuK3sWnc

Kafka message event flow here:
https://docs.google.com/drawings/d/1OBQCEQ5USqEUhjvyCvC3b66Eh_LnXD0JdHvChq8vN1A

VESSEL contains the following services:
  - Debouncer: listens to Kafka events generated from https://github.com/ucd-library/rp-ucd-fuseki (based on the on a combination of UCD Library Jena build: 
  https://github.com/ucd-library/jena and the custom https://github.com/ucd-library/fuseki-kafka-connector), places them in Redis, waits for events to quite
  down, pops messages off redis queue, adds message to Kafka index topic.
  - Indexer: Listens to Kafka events on index topic, checks subject rdf:type for known vivo model type, inserts vivo model into elastic search using SPARQL query.
  - API: Rest API layer for elastic search
  - Gateway: Main HTTP entry point.  Routes requests to proper backend service including; client web application, rest api, authentication, or fuseki.

VESSEL is combined with:
  - Fuseki (EB): https://github.com/ucd-library/rp-ucd-fuseki
  - Elastic Search
  - Kafka + Zookeeper
  - Redis
  - Client web application: https://github.com/ucd-library/rp-ucd-client

In the https://github.com/ucd-library/rp-ucd-deployment library to create the Researcher Profiles application.

# Development

This repository only containers the service Docker file for running the service.  However most of these services are meant to be run as part of the research profiles deployment.  It is recommend that you follow the https://github.com/ucd-library/rp-ucd-deployment development instructions when developing services in the repository.

# Customization

VESSEL is intentionally without a web client.  The client is defined to the deployment layer, allowing full customization of the user interface.

In the future, the Vivo SPARQL queries and Elastic Search schema definition files will be removed as well and defined in the deployment.  This will allow for full customization of both the data model used and the user interface while leveraging the VESSEL service stack and deployment architecture.

# Known Issues

Zookeeper not starting with error: `Zookeeper: java.io.IOException: No snapshot found, but there are log entries. Something is broken`

// docker volume rm rp-local-dev_zookeeper-data
// docker volume rm rp-local-dev_zookeeper-datalog