const {sparql, kafka, fuseki, config, logging} = require('@ucd-lib/rp-node-utils');
const elasticSearch = require('./lib/elastic-search');

/**
 * @function index
 * @description given subject uri; check if the subject rdf:type is of a
 * known es model type, if so query Fuseki using es model sparql query and
 * insert into elastic search
 * 
 * @param {String} uri subject uri
 */
async function index(uri, msg) {
  let response = await fuseki.query(`select * { GRAPH ?g {<${uri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}}`)
  response = await response.json();
  let types = [...new Set(response.results.bindings.map(term => term.type.value))];

  for( let type of types ) {
    if( !sparql.TYPES[type] ) continue;

    logging.info('Loading', uri, 'with model', type, '.  Sent by '+(msg.sender || 'unknown'));
    let result = await sparql.getModel(type, uri);
    await elasticSearch.insert(result.model);
    logging.info('Updated', uri);
    break;
  }
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
  await kafka.connect();
  await elasticSearch.connect();

  await kafka.initConsumer([{
    topic: config.kafka.topics.index,
    partitions: 1,
    replicationFactor: 1
  }])

  // TODO: lookup latest offset
  kafka.consume(
    [{
      topic: config.kafka.topics.index,
      partition: 0,
      offset: 7
    }],
    {
      autoCommit: false,
      fromOffset: true
    },
    async msg => {
      msg = JSON.parse(msg.value);
      await index(msg.subject, msg);
    }
  );
})();