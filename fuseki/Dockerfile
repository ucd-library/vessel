FROM ucdlib/jena-fuseki-eb

RUN mv /docker-entrypoint.sh /docker-entrypoint-org.sh
COPY ./docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p /jena-fuseki/extra
COPY jena-kafka-connector-0.0.1-SNAPSHOT.jar /jena-fuseki/extra/jena-kafka-connector-0.0.1-SNAPSHOT.jar
COPY config.ttl /jena-fuseki/config.ttl

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/jena-fuseki/fuseki-server", "--config=/jena-fuseki/config.ttl"]