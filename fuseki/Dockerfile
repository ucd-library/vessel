FROM stain/jena-fuseki

RUN mv /docker-entrypoint.sh /docker-entrypoint-org.sh
COPY ./docker-entrypoint.sh /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["/jena-fuseki/fuseki-server"]