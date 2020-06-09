const {Client} = require('elasticsearch');
const vivo = require('./vivo.json');
const waitUntil = require('./wait-util');

class ElasticSearch {

  constructor() {
    this.client = new Client({
      host: 'http://elastic:changeme@elasticsearch:9200',
      requestTimeout : 3*60*1000
    });

    this.init();
  }

  /**
   * @method isConnected
   * @description make sure we are connected to elasticsearch
   */
  async isConnected() {
    if( this.connected ) return;
    console.log('waiting for es connection')
    await waitUntil('elasticsearch', 9200);
    console.log('connected');

    // sometimes we still aren't ready....
    try {
      await this.client.ping({requestTimeout: 5000});
      this.connected = true;
    } catch(e) {
      console.log(e)
      await this.isConnected();
    }
  }

  /**
   * @method init
   * @description connect to elasticsearch and ensure collection indexes
   */
  async init() {
    await this.isConnected();

    console.log('Connected to Elastic Search');

    await this.ensureIndex('research-profiles', 'research-profile', require('./vivo.json'));
  }

  /**
   * @method ensureIndex
   * @description make sure given index exists in elastic search
   * 
   * @param {String} alias 
   * @param {String} schemaName 
   * @param {Object} schema 
   * 
   * @returns {Promise}
   */
  async ensureIndex(alias, schemaName, schema) {
    let exits = await this.client.indices.existsAlias({name: alias});
    console.log(`Alias exists: ${alias}`);
    if( exits ) return;

    console.log(`No alias exists: ${alias}, creating...`);

    let indexName = await this.createIndex(alias, schemaName, schema);
    await this.client.indices.putAlias({index: indexName, name: alias});
    
    console.log(`Index ${indexName} created pointing at alias ${alias}`);
  }

  async insert(record) {
    await this.isConnected();

    return this.client.index({
      index : 'research-profiles',
      id : record['@id'],
      body: record
    });
  }

  /**
   * @method createIndex
   * @description create new new index with a unique name based on alias name
   * 
   * @param {String} alias alias name to base index name off of
   * @param {String} schemaName schema name for objects in index
   * 
   * @returns {Promise} resolves to string, new index name
   */
  async createIndex(alias, schemaName, schema) {
    var newIndexName = `${alias}-${Date.now()}`;

    try {
      await this.client.indices.create({
        index: newIndexName,
        body : {
          settings : {
            analysis : {
              analyzer: {
                autocomplete: { 
                  tokenizer: 'autocomplete',
                  filter: [
                    'lowercase'
                  ]
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
          mappings : vivo
        }
      });
    } catch(e) {
      throw e;
    }

    return newIndexName;
  }


}

module.exports = new ElasticSearch();