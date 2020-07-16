const {config, elasticSearch, logger} = require('@ucd-lib/rp-node-utils');
const vivo = require('./vivo.json');

class ElasticSearch {


  /**
   * @method connect
   * @description connect to elasticsearch and ensure collection indexes
   */
  async connect() {
    await elasticSearch.connect();
    this.client = elasticSearch.client;

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
   * 
   * @returns {Promise} resolves to string, new index name
   */
  async createIndex(alias) {
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