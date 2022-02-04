#! /bin/bash

zk_host=${ZOOKEEPER_HOST:-zookeeper:2181}
k_host=${kafka:-kafka:9092}

wait-for-it $zk_host -t 0
wait-for-it $k_host -t 0

patch_topic=fuseki-rdf-patch
status_topic=vessel-status-update
index_topic=index-rdf-subject
reindex_topic=reindex-rdf-subject
indexer_status_topic=indexer-status-update
topics=( $patch_topic $status_topic $index_topic $reindex_topic $indexer_status_topic )

partitions=10
replication_factor=1
topic_retention=604800000 # 7 days

for topic in "${topics[@]}"; do
  kafka-topics.sh --create \
    --zookeeper ${zk_host} \
    --replication-factor ${replication_factor} \
    --partitions ${partitions} \
    --topic ${topic} || true

  # run as second command to ensure config is updated
  kafka-configs.sh --alter \
    --bootstrap-server ${k_host} \
    --entity-type topics \
    --entity-name ${topic} \
    --add-config retention.ms=${topic_retention}
done

echo "kafka initialization complete, container exiting"