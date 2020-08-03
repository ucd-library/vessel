const {fuseki, kafka, logger, config} = require('@ucd-lib/rp-node-utils');
const esSparqlModel = require('./es-sparql-model');
const elasticSearch = require('./elastic-search');



class Reindex {

  constructor() {
    this.COMMANDS = {
      CREATE_INDEX : 'create-index',
      SET_ALIAS : 'set-alias',
      DELETE_INDEX : 'delete-index'
    }

    this.STATES = {
      STOPPED : 'stopped',
      RUNNING : 'running'
    }

    this.state = {
      state : this.STATES.STOPPED
    }
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
   * @param {Boolean} opts.updateSchema
   */
  async run(opts={}) {
    if( this.state.state !== this.STATES.STOPPED ) return;

    this.state = {
      type : opts.type || 'all',
      state : this.STATES.RUNNING,
      newIndex : opts.updateSchema ? `${config.elasticSearch.indexAlias}-${Date.now()}` : null
    }

    if( !this.kafkaProducer ) {
      this.kafkaProducer = new kafka.Producer({
        'metadata.broker.list': config.kafka.host+':'+config.kafka.port
      })
    }
    
    await this.kafkaProducer.connect();
    await kafka.utils.ensureTopic({
      topic : config.kafka.topics.index,
      num_partitions: 1,
      replication_factor: 1
    }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

    let currentIndexes = [];
    if( this.state.newIndex ) {
      // store for removal message below
      currentIndexes = await elasticSearch.getCurrentIndexes();

      logger.info(`Sending ${this.COMMANDS.CREATE_INDEX} ${this.state.newIndex} command to index topic`);
      this.kafkaProducer.produce({
        topic : config.kafka.topics.index,
        value : {
          sender : 'reindexer',
          cmd : this.COMMANDS.CREATE_INDEX,
          index : this.state.newIndex
        },
        key : 'reindexer'
      });
    }

    if( !opts.type ) {
      logger.info('Reindexing all types: ', Object.keys(esSparqlModel.TYPES));
      for( let key in esSparqlModel.TYPES ) {
        await this._indexType(key);
      }
    } else {
      await this._indexType(type);
    }

    if( this.state.newIndex ) {
      logger.info(`Sending ${this.COMMANDS.SET_ALIAS} ${this.state.newIndex} command to index topic`);
      this.kafkaProducer.produce({
        topic : config.kafka.topics.index,
        value : {
          sender : 'reindexer',
          cmd : this.COMMANDS.SET_ALIAS,
          index : this.state.newIndex
        },
        key : 'reindexer'
      });

      for( let index of currentIndexes ) {
        logger.info(`Sending ${this.COMMANDS.DELETE_INDEX} ${index.index} command to index topic`);
        this.kafkaProducer.produce({
          topic : config.kafka.topics.index,
          value : {
            sender : 'reindexer',
            cmd : this.COMMANDS.DELETE_INDEX,
            index : index.index
          },
          key : 'reindexer'
        });
      }
    }

    await this.kafkaProducer.disconnect();

    this.state = {
      state : this.STATES.STOPPED
    }
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

        let msg = {
          topic : config.kafka.topics.index,
          value : {
            sender : 'reindexer',
            subject, type
          },
          key : 'reindexer'
        }

        if( this.state.newIndex ) {
          msg.value.index = this.state.newIndex;
        }

        this.kafkaProducer.produce(msg);
      }

      if( subjects.length ) page++;
      else page = -1;
    }
  }

  async getSubjectsForType(type, page, count=100) {
    let response = await fuseki.query(`PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?subject WHERE {
      GRAPH ?g { ?subject rdf:type <${type}> .}
    }
    ORDER BY (?subject)
    LIMIT ${count}
    OFFSET ${page*100}
    `);
    response = await response.json();
    return [...new Set(response.results.bindings.map(term => term.subject.value))];
  }


}

module.exports = new Reindex();