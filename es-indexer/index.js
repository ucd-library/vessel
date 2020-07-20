const {sparql, kafka, fuseki, config, logger} = require('@ucd-lib/rp-node-utils');
const elasticSearch = require('./lib/elastic-search');

/**
 * @function index
 * @description given subject uri; check if the subject rdf:type is of a
 * known es model type, if so query Fuseki using es model sparql query and
 * insert into elastic search
 * 
 * @param {String} uri subject uri
 */
async function index(uri, id, msg) {
  // if type was included in message and a known type,
  // just insert
  if( msg.type && sparql.TYPES[msg.type] ) {
    await insert(uri, id, msg, type);
    return;
  }

  let response = await fuseki.query(`select * { GRAPH ?g {<${uri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}}`)
  
  let body;
  try {
    body = await response.text();
    body = JSON.parse(body);
  } catch(e) {
    logger.error(`From ${id} sent by ${msg.sender || 'unknown'}: Fuseki request failed (${response.status}):`, body);
    return;
  }

  let types = [...new Set(body.results.bindings.map(term => term.type.value))];

  for( let type of types ) {
    if( !sparql.TYPES[type] ) continue;
    await insert(uri, id, msg, type);
    break;
  }
}

/**
 * @function insert
 * @description insert es model from uri/type
 * 
 * @param {String} uri uri of model 
 * @param {String} id unique kafka message id
 * @param {Object} msg kafka message
 * @param {String} type rdf type of model
 */
async function insert(uri, id, msg, type) {
  logger.info(`From ${id} sent by ${msg.sender || 'unknown'} loading ${uri} with model ${type}`);
  let result = await sparql.getModel(type, uri);
  await elasticSearch.insert(result.model);
  logger.info('Updated', uri);
  ;
}

/**
 * Open connections to kafka and elastic search.  Consume the Kafka index stream.
 * Read messages off stream, check if they are of a known type, if so, insert
 * into elastic search
 * 
 * Messages should be a stringified JSON object with a 'subject' property that is the 
 * subject URI as a string.  Additional 'nice to have' properties are:
 */
(async function() {
  let consumer = new kafka.Consumer({
    'group.id': config.kafka.groups.index,
    'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    'enable.auto.commit': true
  })
  await consumer.connect();
  await elasticSearch.connect();

  await kafka.utils.ensureTopic({
    topic : config.kafka.topics.index,
    num_partitions: 1,
    replication_factor: 1
  }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

  let watermarks = await consumer.queryWatermarkOffsets(config.kafka.topics.index);
  let topics = await consumer.committed(config.kafka.topics.index);
  logger.info(`Indexer (group.id=${config.kafka.groups.index}) kafak status=${JSON.stringify(topics)} watermarks=${JSON.stringify(watermarks)}`);

  // assign to front of committed offset
  await consumer.assign(topics);

  consumer.consume(async msg => {
    let id = kafka.utils.getMsgId(msg);
    logger.info('handling kafka message: '+id);
    msg = JSON.parse(msg.value);
    await index(msg.subject, id, msg);
  });

})();