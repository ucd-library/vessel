const elasticSearch = require('./elastic-search');
const {redis, logger, fuseki, esSparqlModel} = require('@ucd-lib/rp-node-utils');


process.on('unhandledRejection', e => {
  logger.error('Unhandled rejection in indexer-exec.js', e);
  setTimeout(() => process.exit(-1), 50);
});

/**
 * @class IndexerExec
 * @description main indexer that reads kafka stream, debounces uris, queries fuseki and
 * finally inserts model into elastic search
 */
class IndexerInsert {

  constructor() {
    process.on('message', async event => {
      await this.connect();

      if( typeof event.msg === 'string' ) {
        event.msg = JSON.parse(event.msg);
      }

      try {
        await this.index(event.msg);
      } catch(err) {
        logger.error(`Failed to update ${event.msg.subject}`);

        // capture failures
        await elasticSearch.insert({
          '@id' : event.msg.subject,
          _indexer : {
            success : false,
            error : {
              message : err.message,
              stack : err.stack
            },
            logs : err.logs || null,
            kafkaMessage : event.msg,
            timestamp: new Date()
          }
        }, event.msg.index);
      }

      await this.clearKey(event.key);

      event.finished = true;
      process.send(event);
    });
  }

  /**
   * @method connect
   * @description connect to elastic search
   */
  async connect() {
    if( this.connected ) return;
    await redis.connect();
    await elasticSearch.connect();
    this.connected = true;
  }

  clearKey(key) {
    return redis.client.del(key);
  }

  /**
   * @method insert
   * @description insert es model from uri/type
   * 
   * @param {String} key redis key
   * @param {String} uri uri of model 
   * @param {String} id unique kafka message id
   * @param {Object} msg kafka message
   * @param {String} type rdf type of model
   */
  async insert(uri, id, msg, type) {
    logger.info(`From ${id} sent by ${msg.sender || 'unknown'} loading ${uri} with model ${(await esSparqlModel.hasModel(type))}. ${msg.force ? 'force=true' : ''}`);
    
    let result;
    try{ 
      result = await esSparqlModel.getModel(type, uri);
    } catch(e) {
      e.logs = [
        'Failed to get sparql model'
      ]
      throw e;
    }

    result.model._indexer = {
      success : true,
      kafkaMessage : msg,
      timestamp : new Date()
    };

    await elasticSearch.insert(result.model, msg.index);
    logger.info(`Updated ${uri} into ${msg.index || 'default alias'}`);
  }
  
  /**
   * @method index
   * @description given subject uri; check if the subject rdf:type is of a
   * known es model type, if so query Fuseki using es model sparql query and
   * insert into elastic search
   */
  async index(msg) {
    await this.connecting;

    if( typeof msg === 'string' ) {
      msg = JSON.parse(msg);
    }

    let types = await this.getTypes(msg);

    for( let type of types ) {
      if( !(await esSparqlModel.hasModel(type)) ) continue;
      await this.insert(msg.subject, msg.msgId, msg, type);
      break;
    }
  }

  async getTypes(msg) {
    if( msg.type ) {
      return Array.isArray(msg.type) ? msg.type : [msg.type];
    }

    let response = await fuseki.query(`select * { <${msg.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}`)
    
    let bodyText, body;
    try {
      bodyText = await response.text();
      body = JSON.parse(bodyText);
    } catch(e) {
      logger.error(`From ${msg.msgId} sent by ${msg.sender || 'unknown'}: Fuseki request failed (${response.status}):`, bodyText);
      e.logs = [
        `query: select * { <${msg.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}`
        `From ${msg.msgId} sent by ${msg.sender || 'unknown'}: Fuseki request failed (${response.status}):`, bodyText
      ]
      throw e;
    }

    let types = [...new Set(body.results.bindings.map(term => term.type.value))];
    return types;
  }
  
}

module.exports = new IndexerInsert();
