const {config, elasticSearch, logger, Status} = require('@ucd-lib/rp-node-utils');
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
  }


  async connect() {
    await elasticSearch.connect();
    await this.ensureIndex('research-profiles', null, require('./schema.json'));
    await this.status.connect();
  }

  async _onMessage(msg) {
    if( msg.service === 'indexer' && msg.action !== 'index' ) {
      // ignoring these for now
      return;
    }

    msg.shortId = msg.subject.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':');

    await elasticSearch.client.update({
      index : config.elasticSearch.statusIndex,
      id : msg.subject,
      body : {
        doc: msg,
        doc_as_upsert: true
      }
    })
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