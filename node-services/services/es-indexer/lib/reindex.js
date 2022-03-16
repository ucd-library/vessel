const {fuseki, kafka, logger, config, esSparqlModel, redis} = require('@ucd-lib/rp-node-utils');
const elasticSearch = require('./elastic-search');

class Reindex {

  constructor(indexer) {
    this.COMMANDS = {
      CREATE_INDEX : 'create-index',
      SET_ALIAS : 'set-alias',
      DELETE_INDEX : 'delete-index'
    }

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.index,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
      // subscribe to front of committed offset
      'auto.offset.reset' : 'earliest'
    });

    this.indexer = indexer;
  }

  async connect() {
    await redis.connect();
    await elasticSearch.connect();
    await this.kafkaConsumer.connect();
    // logger.info('waiting for topics: ', [config.kafka.topics.indexerStatusUpdate]);
    // await this.kafkaConsumer.waitForTopics([config.kafka.topics.indexerStatusUpdate]);
    // logger.info('topics ready: ', [config.kafka.topics.indexerStatusUpdate]);
    // await this.kafkaConsumer.subscribe([config.kafka.topics.indexerStatusUpdate]);
    this.listen();
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      console.error('kafka consume error', e);
    }
  }

  /**
   * @method onMessage
   * @description listens to the indexer-status-update topic.  Checks for completed index, then swaps
   * if complete
   *
   * @param {*} msg
   * @returns
   */
  async onMessage(msg) {
    let p = JSON.parse(msg.value.toString('utf-8'));

    let pendingDeleteIndexes = await redis.client.get(config.redis.keys.indexesPendingDelete);
    if( p.searchIndex === p.writeIndex && p.pendingDeleteIndexes.length === 0 ) {
      return;
    }

    if( p.searchIndex !== p.writeIndex ) {
      let index = p.indexes[p.writeIndex];
      if( index.indexer.complete !== index.total ) return;

      // set the search alias to the current write index
      this.setIndex(p.writeIndex);
    }

    // delete any pending indexes, cleanup stats
    await this.deletePending(p.pendingDeleteIndexes);
  }

  setIndex(writeIndex) {
    logger.info(`swapping aliases: ${config.elasticSearch.indexAlias} -> ${writeIndex}`);
    return elasticSearch.client.indices.putAlias({
      index: writeIndex, 
      name: config.elasticSearch.indexAlias
    });
  }

  async deletePending(pendingDeleteIndexes) {
    if( !pendingDeleteIndexes ) {
      pendingDeleteIndexes = await redis.client.get(config.redis.keys.indexesPendingDelete);
    }

    for( let index of pendingDeleteIndexes ) {
      logger.info(`deleting index: ${index}`);
      await elasticSearch.client.indices.delete({index});
      await elasticSearch.client.deleteByQuery({
        index : config.elasticSearch.statusIndex,
        body : {
          query : {
            bool : {
              filter : {
                term : {index}
              }
            }
          }
        }
      });
    }

    await redis.client.del(config.redis.keys.indexesPendingDelete);
  }

  getState() {
    return this.state;
  }

  /**
   * @method run
   * @description run the reindexer.  Will only run if in stopped state.  This method only adds items
   * to index
   *
   * @param {Object} opts
   * @param {String} opts.type Es model type to reindex.  ex: person, organization, etc. If not provided,
   * all types will be reindexed
   * @param {Boolean} opts.updateSchema rebuild entire schema, replacing current when complete
   */
  async run(opts={}) {
    // make sure we have created the producer
    if( !this.kafkaProducer ) {
      this.kafkaProducer = new kafka.Producer({
        'metadata.broker.list': config.kafka.host+':'+config.kafka.port
      });
    }

    // connect to kafka and ensure index topic
    await this.kafkaProducer.connect();
    this.kafkaProducer.client.setPollInterval(config.kafka.producerPollInterval);

    // if we are creating a new index (via update schema opt) find current indexes and sav
    // send command to create the new index that subjects will be inserted into
    if( opts.updateSchema ) {
      // store for removal message below
      let currentIndexes = (await elasticSearch.getCurrentIndexes()).map(item => item.index);
      await redis.client.set(config.redis.keys.indexesPendingDelete, JSON.stringify(currentIndexes));

      // create new index for write, we will swap when complete
      await elasticSearch.createIndex(config.elasticSearch.indexAlias);
    }

    let modelMeta = await esSparqlModel.info();

    if( !opts.type ) { // reindex all types
      logger.info('Reindexing all types: ', Object.keys(modelMeta.types));
      for( let key in modelMeta.types ) {
        await this._indexType(key);
      }
    } else { // reindex single type
      let def = modelMeta.models[opts.type];
      if( def.types ) def = def.types;

      for( let type of def ) {
        await this._indexType(type);
      }
    }

    // TODO: need to check for deletes (query es)
    // TODO: need to listen to status queue and swap when complete!
    // if(  opts.updateSchema  ) {

      // if we are rebuilding the entire schema, set the alias to our new index
      // logger.info(`Sending ${this.COMMANDS.SET_ALIAS} ${this.state.newIndex} command to index topic`);
      // this.kafkaProducer.produce({
      //   topic : config.kafka.topics.index,
      //   value : {
      //     sender : 'reindexer',
      //     cmd : this.COMMANDS.SET_ALIAS,
      //     index : this.state.newIndex
      //   },
      //   key : 'reindexer'
      // });

      // // delete the prior indexes, this is just cleanup
      // for( let index of currentIndexes ) {
      //   logger.info(`Sending ${this.COMMANDS.DELETE_INDEX} ${index.index} command to index topic`);
      //   this.kafkaProducer.produce({
      //     topic : config.kafka.topics.index,
      //     value : {
      //       sender : 'reindexer',
      //       cmd : this.COMMANDS.DELETE_INDEX,
      //       index : index.index
      //     },
      //     key : 'reindexer'
      //   });
      // }
    // }

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
        logger.info('Sending to reindex topic: '+subject+' / '+type);

        let msg = {
          topic : config.kafka.topics.reindex,
          value : {
            sender : 'reindexer',
            subject, type
          },
          key : 'reindexer'
        }

        this.kafkaProducer.produce(msg);
      }

      if( subjects.length ) page++;
      else page = -1;
    }
  }

  /**
   * @method getSubjectsForType
   * @description get all subjects for a certain types.  Allows for pagination
   *
   * @param {String} type rdf type
   * @param {Number} page
   * @param {Number} count
   */
  async getSubjectsForType(type, page, count=100) {
    let response = await fuseki.query(`PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?subject WHERE {
      GRAPH ?g { ?subject rdf:type <${type}> .}
    }
    ORDER BY (?subject)
    LIMIT ${count}
    OFFSET ${page*100}
    `);

    try {
      response = await response.text();
      response = JSON.parse(response);

      return [...new Set(response.results.bindings.map(term => term.subject.value))];
    } catch(e) {
      logger.error('Failed: reindex.getSubjectsForType: '+type+', '+page,  'reponse=', response, e);
    }
    return [];
  }


}

module.exports = Reindex;
