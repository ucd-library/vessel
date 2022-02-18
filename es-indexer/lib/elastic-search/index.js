const {config, elasticSearch, redis, logger, fetch} = require('@ucd-lib/rp-node-utils');
const fs = require('fs');
const path = require('path');

class ElasticSearch {


  /**
   * @method connect
   * @description connect to elasticsearch and ensure collection indexes
   */
  async connect() {
    await redis.connect();
    await elasticSearch.connect();
    this.client = elasticSearch.client;

    await this.ensureIndex('research-profiles', null, require('./vivo.json'));
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
    logger.info(`Alias exists: ${alias}`);
    if( exits ) return;

    logger.info(`No alias exists: ${alias}, creating...`);

    let indexName = await this.createIndex(alias, schemaName, schema);
    await this.client.indices.putAlias({index: indexName, name: alias});

    logger.info(`Index ${indexName} created pointing at alias ${alias}`);
  }

  /**
   * @method insert
   * @description insert record into research-profiles index
   *
   * @param {Object} record
   * @param {String} index index to insert into, defaults to main alias
   */
  insert(record, index) {
    return this.client.index({
      index : index || config.elasticSearch.indexAlias,
      id : record['@id'],
      body: record
    });
  }

  /**
   * @method getCurrentIndexes
   * @description given a index alias name, find all real indexes that use this name.
   * This is done by querying for all indexes that regex for the alias name.  The indexers
   * index name creation always uses the alias name in the index.
   *
   * @param {String} alias name of alias to find real indexes for
   * @return {Promise} resolves to array of index names
   */
  async getCurrentIndexes(alias) {
    let re = new RegExp('^'+(alias || config.elasticSearch.indexAlias));
    let results = [];

    try {
      var resp = await this.client.cat.indices({v: true, format: 'json'});
      resp.forEach(i => {
        if( i.index.match(re) || alias === 'all' ) results.push(i);
      });
    } catch(e) {
      throw e;
    }

    try {
      var resp = await this.client.cat.aliases({v: true, format: 'json'});
      resp.forEach(a => {
        let obj = results.find(i => i.index === a.index);
        if( obj ) {
          obj.alias = a.alias;
          if( obj.alias === config.elasticSearch.indexAlias ) {
            obj.active = true;
          }
        }
      });
    } catch(e) {
      throw e;
    }

    return results;
  }

  /**
   * @method createIndex
   * @description create new new index with a unique name based on alias name
   *
   * @param {String} alias alias name to base index name off of
   *
   * @returns {Promise} resolves to string, new index name
   */
  async createIndex(alias, newIndexName) {
    newIndexName = newIndexName && alias !== newIndexName ? newIndexName : `${alias}-${Date.now()}`;
    let schemaTxt = fs.readFileSync(path.join(__dirname, 'vivo.json'));
    let vivo = JSON.parse(schemaTxt, 'utf-8');

    await redis.client.set(config.redis.keys.indexWrite, newIndexName);

    try {
      await this.client.indices.create({
        index: newIndexName,
        body : {
          settings : {
            analysis : {
              analyzer: {
                defaultAnalyzer: {
                  tokenizer: 'standard',
                  filter: ["lowercase", "stop", "asciifolding"]
                },
                // autocomplete_search : {
                //   tokenizer: "lowercase"
                // }
              },
              char_filter: {
                first_letter_filter: {
                  type: "pattern_replace",
                  pattern: "(.).*",
                  // pattern: ".*([a-zA-Z]).*", TODO
                  replacement: "$1"
                }
              },
              normalizer: {
                first_letter_normalizer: {
                  type: "custom",
                  char_filter: ["first_letter_filter"],
                  filter: [
                    "lowercase"
                  ]
                },
                keyword_lowercase: {
                  type: "custom",
                  filter: ["lowercase"]
                }
              },
              tokenizer: {
                // autocomplete: {
                //   type: 'edge_ngram',
                //   min_gram: 1,
                //   max_gram: 20,
                //   token_chars: [
                //     "letter",
                //     "digit"
                //   ]
                // },
                // first_letter : {
                //   pattern : "^(.).*$",
                //   group : 1,
                //   type : "pattern"
                // }
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
