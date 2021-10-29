const {config, elasticSearch, logger, Status, kafka, fetch} = require('@ucd-lib/rp-node-utils');
const fs = require('fs');
const path = require('path');

class StatusWorker {

  constructor() {
    this.status = new Status({
      consumer: 'status-worker',
      onMessage: async msg => {
        if( Array.isArray(msg) ) {
          for( let item of msg ) {
            await this._onMessage(item);
          }
        } else {
          await this._onMessage(msg);
        }
      }
    });

    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });

    this.UPDATE_INTERVAL = 5000;
  }


  async connect() {
    await elasticSearch.connect();
    await this.ensureIndex('research-profiles', null, require('./schema.json'));
    await this.status.connect();

    await this.kafkaProducer.connect();
    await this.kafkaProducer.waitForTopics([config.kafka.topics.indexerStatusUpdate]);
    this.kafkaProducer.client.setPollInterval(config.kafka.producerPollInterval);
  }

  async _onMessage(msg) {
    if( msg.service === 'indexer' && msg.action !== 'index' ) {
      // ignoring these for now
      return;
    }

    let shortId = msg.subject.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':');
    let subject = msg.subject;
    delete msg.subject;
    let index = msg.index;
    delete msg.index;

    let doc = {
      subject, shortId, index,
      timestamp : Date.now(),
      [msg.service] : msg
    };

    if( msg.service === 'debouncer' && msg.status === this.status.STATES.START ) {
      doc.indexer = {
        timestamp : Date.now(),
        status : this.status.STATES.PENDING
      };
    }

    await elasticSearch.client.update({
      index : config.elasticSearch.statusIndex,
      id : index+'-'+subject,
      body : {
        doc,
        doc_as_upsert: true
      }
    });

    if( !this.indexerIntervalTimer ) {
      this.indexerIntervalTimer = setInterval(() => this.sendIndexerStatus(), this.UPDATE_INTERVAL);
    }
    if( this.killIntervalTimer ) clearTimeout(this.killIntervalTimer);
    this.killIntervalTimer = setTimeout(() => {
      clearInterval(this.indexerIntervalTimer);
    }, this.UPDATE_INTERVAL * 2);
  }

  sendIndexerStatus() {
    let resp = await fetch(config.gateway.serviceHosts.api+'/api/indexer/stats');
    this.kafkaProducer.produce({
      topic : config.kafka.topics.indexerStatusUpdate,
      value : await resp.json()
    });
  }

  /**
   * @method ensureIndex
   * @description make sure given index exists in elastic search
   * 
   * @returns {Promise}
   */
     async ensureIndex() {
      let name = config.elasticSearch.statusIndex;

      logger.info(`Checking if index exists: ${name}`);
      let exits = await elasticSearch.client.indices.exists({index: name});
      if( exits ) return;
  
      logger.info(`No index exists: ${name}, creating...`);
      await this.createIndex();
    }

  /**
   * @method createIndex
   * @description create new new index with a unique name based on alias name
   * 
   * @param {String} alias alias name to base index name off of
   * 
   * @returns {Promise} resolves to string, new index name
   */
  async createIndex() {
    let status = JSON.parse(fs.readFileSync(path.join(__dirname, 'schema.json'), 'utf-8'));

    try {
      await elasticSearch.client.indices.create({
        index: config.elasticSearch.statusIndex,
        body : {
          settings : {
            analysis : {
              analyzer: {
                autocomplete: { 
                  tokenizer: 'autocomplete',
                  filter: ['lowercase']
                },
                autocomplete_search : {
                  tokenizer: "lowercase"
                }
              },
              tokenizer: {
                autocomplete: {
                  type: 'edge_ngram',
                  min_gram: 1,
                  max_gram: 20,
                  token_chars: [
                    "letter",
                    "digit"
                  ]
                }
              }
            }
          },
          mappings : status
        }
      });
    } catch(e) {
      throw e;
    }
  }

}

module.exports = StatusWorker;