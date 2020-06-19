FROM openjdk:8-buster
ARG RDF_DELTA_VERSION

# RUN apk update \
#     && apk add --no-cache bash curl unzip

RUN apt-get update && apt-get install -y curl unzip

RUN curl https://repo1.maven.org/maven2/org/seaborne/rdf-delta/rdf-delta-dist/${RDF_DELTA_VERSION}/rdf-delta-dist-${RDF_DELTA_VERSION}.zip -o /tmp/rdf-delta-dist.zip \
    && unzip /tmp/rdf-delta-dist.zip -d /opt \
    && mv /opt/rdf-delta-* /opt/rdf-delta \
    && rm /tmp/rdf-delta-dist.zip

ENV DELTA_HOME=/opt/rdf-delta
RUN ln -s /opt/rdf-delta/dcmd /usr/local/bin/dcmd 

COPY ./fuseki-config.ttl /opt/rdf-delta/fuseki-config.ttl
COPY ./testinference.rules /opt/rdf-delta/testinference.rules
COPY ./reglas.rules /opt/rdf-delta/reglas.rules
COPY ./model.ttl /opt/rdf-delta/model.ttl