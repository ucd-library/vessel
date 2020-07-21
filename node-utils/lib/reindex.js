const sparql = require('./sparql');
const kafka = require('./kafka');
const logger = require('./logger');
const config = require('./config');

class Reindex {

  async run(type) {
    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    })
    await this.kafkaProducer.connect();
    await kafka.utils.ensureTopic({
      topic : config.kafka.topics.index,
      num_partitions: 1,
      replication_factor: 1
    }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

    if( !type ) {
      logger.info('Reindexing all types: ', Object.keys(sparql.TYPES));
      for( let key in sparql.TYPES ) {
        await this._run(key);
      }
      
    } else {
      await this._run(type);
    }

    await this.kafkaProducer.disconnect();
  }

  /**
   * @method _indexType
   * @description query Fuseki for all subjects of a certain type,
   * then send subjects to index queue
   * 
   * @param {String} type 
   */
  async _indexType(type) {
    logger.info('Reindexing type: ', type);

    let page = 0;
    while( page != -1 ) {
      let subjects = await this.getSubjectsForType(type, page);
      for( let subject of subjects ) {
        logger.info('Sending to index topic: '+subject+' / '+type);

        this.kafkaProducer.produce({
          topic : config.kafka.topics.index,
          value : {
            sender : 'reindexer',
            subject, type
          },
          key : 'debouncer'
        });
      }

      if( subjects.length ) page++;
      else page = -1;
    }
  }

  async getSubjectsForType(type, page, count=100) {
    let response = await fuseki.query(`PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?subject WHERE {
      GRAPH ?g { ?subject rdf:type <${type}> .}
      ORDER BY (?subject)
      LIMIT ${count}
      OFFSET ${page*100}
    }`);
    response = await response.json();
    return [...new Set(response.results.bindings.map(term => term.subject.value))];
  }


}

module.exports = Reindex;