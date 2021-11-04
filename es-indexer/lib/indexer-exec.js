const elasticSearch = require('./elastic-search');
const {config, redis, logger, fuseki, esSparqlModel, Status} = require('@ucd-lib/rp-node-utils');


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
    this.acl = {
      types : [],
      roles : []
    }
    
    if( config.data && config.data.private 
        && config.data.private.types
        && config.data.private.types.length 
        && config.data.private.roles
        && config.data.private.roles.length ) {
      this.acl.roles = [... config.data.private.roles];
      this.acl.types = [... config.data.private.types];
    }

    this.status = new Status({producer: 'indexer-exec'});

    process.on('message', async event => {
      await this.connect();

      if( typeof event.msg === 'string' ) {
        event.msg = JSON.parse(event.msg);
      }

      try {
        await this.index(event.msg);
      } catch(err) {
        logger.error(`Failed to update`, event);

        this.status.send({
          status : this.status.STATES.ERROR, 
          subject : event.msg.subject,
          action: 'index',
          index : event.msg.index,
          error : {
            id : event.msg.subject.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':'),
            message : err.message,
            stack : err.stack,
            logs : err.logs || null,
            kafkaMessage : event.msg,
          }
        });
      }

      // await this.clearKey(event.key);

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
    await this.status.connect();
    this.connected = true;
  }

  // clearKey(key) {
  //   return redis.client.del(key);
  // }

  /**
   * @method insert
   * @description insert es model from uri/type
   * 
   * @param {String} uri uri of model 
   * @param {String} id unique kafka message id
   * @param {Object} msg kafka message
   * @param {String} type rdf type of model
   */
  async insert(uri, id, msg, type) {
    let modelType = await esSparqlModel.hasModel(type);
    logger.info(`From ${id} sent by ${msg.sender || 'unknown'} loading ${uri} with model ${modelType}. ${msg.force ? 'force=true' : ''}`);
    
    let result;
    try{ 
      result = await esSparqlModel.getModel(type, uri);
    } catch(e) {
      e.logs = [
        'Failed to get sparql model'
      ]
      throw e;
    }

    // apply acl
    if( this.acl.types.includes(modelType) ) {
      result.model._acl = this.acl.roles;
    } else {
      result.model._acl = ['public'];
    }

    if( !result.model._ ) result.model._ = {};
    result.model._.updated = Date.now();

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
