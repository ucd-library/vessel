const {config, logger, metrics, fuseki, esSparqlModel, elasticSearch} = require('@ucd-lib/rp-node-utils');


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
    
    if( config?.data?.private?.types?.length &&
        config?.data?.private?.roles?.length ) {
      this.acl.roles = [... config.data.private.roles];
      this.acl.types = [... config.data.private.types];
    }

    process.on('message', async event => {
      await this.connect();

      if( typeof event.msg === 'string' ) {
        event.msg = JSON.parse(event.msg);
      }

      let {id, type} = event.msg;

      try {
        await this.index(event.msg);
        event.success = true;
      } catch(err) {
        this.logError(id, type, err);
      }

      event.finished = true;
      event.timestamp = Date.now();
      process.send(event);
    });
  }

  /**
   * @method connect
   * @description connect to elastic search
   */
  async connect() {
    if( this.connected ) return;
    await elasticSearch.connect();
    this.connected = true;
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
    logger.debug(`From ${id} sent by ${msg.sender || 'unknown'} loading ${uri} with model ${modelType}. ${msg.force ? 'force=true' : ''}`);
    
    let result = await esSparqlModel.getModel(type, uri, msg.database);

    // apply acl
    if( this.acl.types.includes(modelType) ) {
      result.model._acl = this.acl.roles;
    } else {
      result.model._acl = ['public'];
    }

    if( !result.model._ ) result.model._ = {};
    result.model._.updated = Date.now();

    await elasticSearch.insert(result.model, msg.index);
    // logger.info(`Updated ${uri} using ${modelType} into ${msg.index || 'default alias'}`);
  }

  async getTypes(msg) {
    if( msg.type ) {
      return Array.isArray(msg.type) ? msg.type : [msg.type];
    }

    let response = await fuseki.query(
      `select * { <${msg.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}`,
      null, msg.database  
    )
    
    let bodyText = await response.text();
    let body = JSON.parse(bodyText);

    let types = [...new Set(body.results.bindings.map(term => term.type.value))];
    return types;
  }

  logError(id, type, error) {
    metrics.logIndexEvent(
      metrics.DEFINITIONS['es-index-status'].type,
      {status: 'error', type}, 1,
      id, {error}
    )
  }
  
}

module.exports = new IndexerInsert();
