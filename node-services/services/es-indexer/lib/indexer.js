const {kafka, fetch, redis, metrics, logger, config, elasticSearch, esSparqlModel} = require('@ucd-lib/rp-node-utils');
const {fork} = require('child_process');
const { type } = require('os');
const path = require('path');

/**
 * @class Indexer
 * @description main indexer that reads kafka stream, debounces uris, queries fuseki and
 * finally inserts model into elastic search
 */
class Indexer {

  constructor() {
    // this.lastMessageTimer = null;
    this.run = true;

    this.childExecFile = path.resolve(__dirname, 'indexer-exec.js');
    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.index,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
      // subscribe to front of committed offset
      'auto.offset.reset' : 'earliest'
    });
  }

  /**
   * @method connect
   * @description connect to redis, kafka and elastic search. Ensure kafka topic.  Query 
   * for kafka watermarks and last commited offset.  Register consumer to last committed 
   * offset and start reading kafka stream.  After a small delay, check to see if any messages 
   * are stashed in redis that were never executed
   */
  async connect() {
    await redis.connect();
    await elasticSearch.connect();
    await elasticSearch.ensureIndex();

    await this.kafkaConsumer.connect();

    let topics = [config.kafka.topics.gcs];
    logger.info('waiting for topics: ', topics);
    await this.kafkaConsumer.waitForTopics(topics);
    logger.info('topics ready: ', topics);

    await this.kafkaConsumer.subscribe([config.kafka.topics.gcs]);

    this.listen();
  }

  /**
   * @method reindex
   * @description reindex gcs files, optionally by type.  Flags allow 
   * you to create and write to a new index as well as update search
   * alias when complete (todo).
   * 
   * @param {Object} flags
   * @param {Boolean} flags.fresh-index
   * @param {Boolean} flags.auto-update-alias 
   * @param {String} flags.type 
   * 
   * @returns {Promise<Object>}
   */
  async reindex(flags) {
    let resp = {flags};
    
    if( flags['fresh-index'] ) {
      resp.newIndex = await elasticSearch.createIndex();
      await elasticSearch.setWriteIndex(resp.newIndex);
    }

    let url = config.gateway.serviceHosts.gcs+'/api/reindex-all';
    if( flags.type ) url += '/'+type;

    let gcsResp = await fetch(url);
    gcsResp = await gcsResp.json();

    return Object.assign(res, gcsResp);
  }

  createChildExec() {
    if( this.childProc ) return;
    logger.info('Creating child exec process');

    this.childProc = fork(this.childExecFile);
    this.childProc.on('exit', (code) => this._handleChildProcEvent(code));
    this.childProc.on('error', e => this._handleChildProcEvent(e));
    this.childProc.on('message', e => this._handleChildProcEvent(null, e));
  }

  _handleChildProcEvent(err, msg) {
    if( err !== null && err !== undefined ) {
      try { this.childProc.kill() }
      catch(e) {};

      this.childProc = null;
      logger.info('Child exec process exited', err);
      if( this.childProcIndexResolve ) {
        let reject = this.childProcIndexResolve.reject;
        this.childProcIndexResolve = null;
        reject(err);
      }
      return;
    }

    if( this.childProcIndexResolve ) {
      let resolve = this.childProcIndexResolve.resolve;
      this.childProcIndexResolve = null;
      resolve(msg);
    }
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      logger.error('kafka consume error', e);
    }
  }

  async onMessage(msg) {
    let id = kafka.utils.getMsgId(msg);
    logger.debug(`handling kafka message: ${id}`);

    let payload;
    try {
      payload = JSON.parse(msg.value);
      payload.msgId = id;
    } catch(e) {
      logger.error(`failed to parse index payload. message: ${id}`, e.message, msg.value.toString('utf-8'));
      return;
    }

    for( id of payload.ids ) {
      let type = payload.type;
      try {  
        if( !type ) {
          type = id.replace(/.*:/, '').replace(/\/.*/, '');
        }
        await this.onIdUpdated(id, type, payload.database, payload.triggeredBy);
      } catch(e) {
        this.logError(id, type, e)
      }
    }

  }

  /**
   * @method onIdUpdated
   * @description handle a kafka message.  Messages should subject index requests or index
   * commands. Resets the message handler timeout (the main part of the debouncer).
   * 
   */
  async onIdUpdated(id, type, database, sender) {
    let subject = id;
    if( !id.match(/^http(s)?:\/\//) ) {
      subject = config.fuseki.rootPrefix.uri + id.replace(/.*:/, '');
    }
    let index = await elasticSearch.getWriteIndex();

    try {
      let payload = {id, subject, type, sender, index, database};
      let resp = await this.indexRecord(payload.subject, payload);
      if( resp.success ) {
        this.logSuccess(id, type);
      }
    } catch(e) {
      this.logError(id, type, e);
    }
  }

  /**
   * @method getKnownModelType
   * @description see if type provided in message is a known type
   * 
   * @param {Object} msg 
   * 
   * @returns {String|null}
   */
  async getKnownModelType(msg) {
    if( msg.type && (await esSparqlModel.hasModel(msg.type)) ) {
      return msg.type;
    }
    if( msg.types ) {
      for( let type of msg.types ) {
        if( (await esSparqlModel.hasModel(type)) ) return type;
      }
    }

    return null;
  }

  /**
   * @method indexRecord
   * @description 
   * 
   * @param {String} key 
   * @param {Object} msg 
   * @returns 
   */
  async indexRecord(key, msg) {
    this.createChildExec();

    if( this.childProcIndexPromise ) {
      await this.childProcIndexPromise;
    }

    this.childProcIndexPromise = new Promise((resolve, reject) => {
      this.childProcIndexResolve = {resolve, reject};
      this.childProc.send({key, msg});
    });

    return this.childProcIndexPromise;
  }

  setSearchIndex(index) {
    logger.info(`swapping aliases: ${config.elasticSearch.indexAlias} -> ${writeIndex}`);
    return elasticSearch.setAlias(index);
  }

  logError(id, type, error) {
    metrics.logIndexEvent(
      metrics.DEFINITIONS['es-index-status'].type,
      {status: 'error', type}, 1,
      id, {error}
    )
  }

  logSuccess(id, type) {
    metrics.logIndexEvent(
      metrics.DEFINITIONS['es-index-status'].type,
      {status: 'success', type}, 1,
      id
    )
  }

}

module.exports = new Indexer();