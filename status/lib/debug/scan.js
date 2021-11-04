const kafka = require('@ucd-lib/node-kafka');

let topic = process.argv[3] || 'vessel-status-update';
let file = process.argv[2];
let consumeFn = require(file);

let consumer = new kafka.Consumer({
  'group.id': 'scan',
  'metadata.broker.list': process.env.KAFKA_BROKER || 'kafka:9092'
});

(async function() {

  await consumer.connect();
  console.log("connected");
  
  let topicMetadata = (await getMetadata(topic)).topics.find(item => item.name === topic);
  if( !topicMetadata ) throw new Error('Unknown topic: '+topic);

  let topics = [];
  for( let partition of topicMetadata.partitions ) {
    let offsets = await getOffsets(topic, partition.id);
    topics.push({topic, partition: partition.id, offset: offsets.lowOffset});
  }
  consumer.client.assign(topics);

  await consumer.consume(msg => consumeFn(msg, kafka));
})();

function getOffsets(topic, partition) {
  return new Promise((resolve, reject) => {
    consumer.client.queryWatermarkOffsets(topic, partition, 5000, (err, offsets) => {
      if( err ) reject(err);
      else resolve(offsets);
    });  
  });
}

function getMetadata(topic) {
  return new Promise((resolve, reject) => {
    consumer.client.getMetadata({topic}, (err, metadata) => {
      if( err ) reject(err);
      else resolve(metadata);
    });
  });

}