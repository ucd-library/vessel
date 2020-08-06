const {kafka, config} = require('@ucd-lib/rp-node-utils');

let offset = 836;

// sample script for dumping a message from a specific offset
(async function() {
  this.kafkaConsumer = new kafka.Consumer({
    'group.id': 'get-message-cmd',
    'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    'enable.auto.commit': false
  });

  await this.kafkaConsumer.connect();

  await this.kafkaConsumer.assign(
    [{topic: config.kafka.topics.rdfPatch, partition: 0, offset}]
  );

  let msg = await this.kafkaConsumer.consumeOne();
  if( !msg ) return console.log(msg);

  if( msg.key ) msg.key = msg.key.toString('utf-8');
  if( msg.value ) msg.value = msg.value.toString('utf-8');
  console.log(msg);
  console.log(msg.value);
})();