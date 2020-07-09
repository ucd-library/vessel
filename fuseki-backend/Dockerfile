FROM ucdlib/jena-fuseki-eb:latest
# FROM stain/jena-fuseki

RUN mv /docker-entrypoint.sh /docker-entrypoint-org.sh
COPY ./docker-entrypoint.sh /docker-entrypoint.sh

RUN mkdir -p $FUSEKI_BASE/extra
COPY ./lib/jena-kafka-connector-0.0.1-SNAPSHOT.jar $FUSEKI_BASE/extra/
COPY ./lib/kafka-clients-2.5.0.jar $FUSEKI_BASE/extra/
COPY ./config.ttl $FUSEKI_BASE/

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/jena-fuseki/fuseki-server"]