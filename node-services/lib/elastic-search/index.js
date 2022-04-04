const {Client} = require('elasticsearch');
const waitUntil = require('../wait-until');
const config = require('../config');
const logger = require('../logger');
const redis = require('../redis');
const fetch = require('node-fetch');
const esIndexConfig = require('./es-index-config');

class ElasticSearch {

  /**
   * @method isConnected
   * @description make sure we are connected to elasticsearch
   */
  async isConnected() {
    if( this.connected ) return;

    logger.info('waiting for es connection');
    await waitUntil(config.elasticSearch.host, config.elasticSearch.port);

    await redis.connect();

    // sometimes we still aren't ready....
    try {
      await this.client.ping({requestTimeout: 5000});
      this.connected = true;
    } catch(e) {
      logger.error(e)
      await this.isConnected();
    }
  }

  /**
   * @method connect
   * @description connect to elasticsearch and ensure collection indexes
   */
  async connect() {
    if( !this.client ) {
      this.client = new Client({
        host: `http://${config.elasticSearch.username}:${config.elasticSearch.password}@${config.elasticSearch.host}:${config.elasticSearch.port}`,
        requestTimeout : config.elasticSearch.requestTimeout
      });
    }

    await this.isConnected();
    logger.info('Connected to Elastic Search');
  }

  analyze(body) {
    return fetch(
      `http://${config.elasticSearch.username}:${config.elasticSearch.password}@${config.elasticSearch.host}:${config.elasticSearch.port}/_analyze`,
      {
        method : 'POST',
        header : {'content-type': 'appliation/json'},
        body : JSON.stringify(body)
      }
    )
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
    let config = Object.assign({}, esIndexConfig);
    config.index = (newIndexName && alias !== newIndexName) ? newIndexName : `${alias}-${Date.now()}`;

    await this.client.indices.create(config);

    return config.index;
  }

  deleteIndex(index) {
    logger.warn(`deleting index: ${index}`);
    return elasticSearch.client.indices.delete({index});
  }

  /**
   * @method ensureIndex
   * @description make sure given index exists in elastic search
   *
   * @param {String} alias Optional
   * @param {String} schemaName Optional
   *
   * @returns {Promise}
   */
  async ensureIndex(alias, schemaName) {
    if( !alias ) alias = config.elasticSearch.indexAlias;

    let exits = await this.client.indices.existsAlias({name: alias});
    logger.info(`Alias exists: ${alias}`);
    if( exits ) return;

    logger.info(`No alias exists: ${alias}, creating...`);

    let indexName = await this.createIndex(alias, schemaName);
    this.setWriteIndex(indexName);
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

  async deleteIfExists(id, index) {
    if( !index ) index = await this.getWriteIndex();
    id = id.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':')
    
    let exists = await this.client.exists({index, id});

    logger.debug(`Checking subject ${id} is in elastic search index ${index}:`, exists);
    if( exists === false ) return false;

    let response = await this.client.delete({index, id});
    if( response.result !== 'deleted' ) {
      logger.error(`Failed to delete ${id} from elastic search index ${index}`, response);
    }

    logger.info(`Deleted subject ${id} from elastic search index ${index}`);

    return true;
  }

  /**
   * @method setWriteIndex
   * @description set the current write index for elastic search
   * 
   * @param {String} index 
   * @returns 
   */
  setWriteIndex(index) {
    return redis.client.set(config.redis.keys.indexWrite, index);
  }

  getWriteIndex() {
    return redis.client.get(config.redis.keys.indexWrite);
  }


  setAlias(index, alias) {
    if( !alias ) alias = config.elasticSearch.indexAlias;
    return this.client.indices.putAlias({index, name: alias});
  }


}

module.exports = new ElasticSearch();