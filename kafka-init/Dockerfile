ARG KAFKA_IMAGE
FROM ${KAFKA_IMAGE}

USER root

RUN apt-get update && apt-get install -y wait-for-it
COPY init.sh /init.sh

ENTRYPOINT ["bash", "-c"]
CMD ["/init.sh && exit"]