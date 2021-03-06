const {kafka, redis, fuseki, logger, config, esSparqlModel} = require('@ucd-lib/rp-node-utils');
const elasticSearch = require('./elastic-search');
const reindex = require('./reindex');

/**
 * @class Indexer
 * @description main indexer that reads kafka stream, debounces uris, queries fuseki and
 * finally inserts model into elastic search
 */
class Indexer {

  constructor() {
    this.lastMessageTimer = null;
    this.run = true;

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.index,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
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

    try {
      await this.kafkaConsumer.connect();

      await kafka.utils.ensureTopic({
        topic : config.kafka.topics.index,
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

      let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(config.kafka.topics.index);
      let topics = await this.kafkaConsumer.committed(config.kafka.topics.index);
      logger.info(`Indexer (group.id=${config.kafka.groups.index}) kafak status=${JSON.stringify(topics)} watermarks=${JSON.stringify(watermarks)}`);

      // subscribe to front of committed offset
      await this.kafkaConsumer.subscribe([config.kafka.topics.index]);
    } catch(e) {
      console.error('kafka init error', e);
    }

    this.listen();

    setTimeout(() => {
      this.handleMessages();
    }, 1000);
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      console.error('kafka consume error', e);
    }
  }

  /**
   * @method onMessage
   * @description handle a kafka message.  Messages should subject index requests or index
   * commands. Resets the message handler timeout (the main part of the debouncer).
   * 
   * Subject index request message:
   * {
   *   subject: [uri],
   *   sender: [label] optional,
   *   force: [boolean] optional,
   *   type: [uri] optional
   * }
   * 
   * 
   * @param {Object} msg kafka message
   */
  async onMessage(msg) {
    this.run = false;

    let id = kafka.utils.getMsgId(msg);
    logger.info(`handling kafka message: ${id}`);

    let payload;
    try {
      payload = JSON.parse(msg.value);
      payload.msgId = id;
    } catch(e) {
      logger.error(`failed to parse index payload. message: ${id}`, e.message, msg.value.toString('utf-8'));
      return;
    }

    // if the msg has the cmd attribute, it's not a index insert
    // handle command and exit
    if( await this.handleCmdMsg(payload) ) {
      this.resetMessageDelayHandler();
      return;
    }

    // unlike the debouncer, lookup subject types 
    // we will only debounce known types
    if( !payload.type || payload.types ) {
      let response = await fuseki.query(`select * { <${payload.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}`)
    
      let body;
      try {
        body = await response.text();
        body = JSON.parse(body);
      } catch(e) {
        logger.error(`From ${payload.msgId} sent by ${payload.sender || 'unknown'}: Fuseki request failed (${response.status}):`, body);
        return;
      }
  
      payload.types = [...new Set(body.results.bindings.map(term => term.type.value))];
    }

    let modelType = await this.getKnownModelType(payload);
    if( !modelType ) {
      logger.info(`Ignoring message ${payload.msgId} with subject ${payload.subject} sent by ${payload.sender || 'unknown'}: Type has no model ${modelType} ${JSON.stringify(payload.types || [])}`);
      return;
    }

    // If force flag, directly index.  Don't debounce.
    if( payload.force ) {
      await this.index(payload);
      return;
    }

    await redis.client.set(config.redis.prefixes.indexer+payload.subject, JSON.stringify(payload));

    this.resetMessageDelayHandler();
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
   * @method handleCmdMsg
   * @description handle the special kafka messages with the 'cmd' flag.  These are mostly
   * used for creating new indexes (with a new schema) and swapping the alias pointer when
   * complete
   * 
   * {
   *   cmd : [String]
   *   index : [String]
   * }
   * 
   * @param {Object} payload kafka message payload
   * 
   * @returns {Boolean} 
   */
  async handleCmdMsg(payload) {
    if( !payload.cmd ) return false;

    if( payload.cmd === reindex.COMMANDS.CREATE_INDEX ) {
      logger.info(`Creating new index ${payload.index}`);
      await elasticSearch.createIndex(config.elasticSearch.indexAlias, payload.index);

    } else if( payload.cmd === reindex.COMMANDS.DELETE_INDEX ) {
      // set for later, needs to be done after indexing
      // There might be more than one, so this is a prefix
      await redis.client.set(config.redis.prefixes.deleteIndex+payload.index, JSON.stringify(payload));

    } else if( payload.cmd === reindex.COMMANDS.SET_ALIAS ) {
      // set for later, needs to be done after indexing
      await redis.client.set(config.redis.keys.setAlias, JSON.stringify(payload));
    }

    return true;
  }

  /**
   * @method resetMessageDelayHandler
   * @description every time a message comes in the kafka queue we reset the timer.
   * When the timer fires we start the actual es update.
   */
  resetMessageDelayHandler() {
    if( this.lastMessageTimer ) {
      clearTimeout(this.lastMessageTimer);
    }

    this.lastMessageTimer = setTimeout(() => {
      this.lastMessageTimer = null;
      this.run = true;
      this.handleMessages();
    }, config.indexer.handleMessageDelay * 1000);
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
  async insert(key, uri, id, msg, type) {
    logger.info(`From ${id} sent by ${msg.sender || 'unknown'} loading ${uri} with model ${(await esSparqlModel.hasModel(type))}. ${msg.force ? 'force=true' : ''}`);
    let result;
    try{ 
      result = await esSparqlModel.getModel(type, uri);
    } catch(e){
      console.log(e);
      return;
    }

    await elasticSearch.insert(result.model, msg.index);
    logger.info(`Updated ${uri} into ${msg.index || 'default alias'}`);
    await redis.client.del(key);
  }

  /**
   * @method index
   * @description given subject uri; check if the subject rdf:type is of a
   * known es model type, if so query Fuseki using es model sparql query and
   * insert into elastic search
   */
  async index(key, msg) {
    if( typeof msg === 'string' ) {
      msg = JSON.parse(msg);
    }

    // if type was included in message and a known type,
    // just insert
    if( msg.type && (await esSparqlModel.hasModel(msg.type)) ) {
      await this.insert(key, msg.subject, msg.msgId, msg, msg.type);
      return;
    }

    let response = await fuseki.query(`select * { <${msg.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}`)
    
    let body;
    try {
      body = await response.text();
      body = JSON.parse(body);
    } catch(e) {
      logger.error(`From ${msg.msgId} sent by ${msg.sender || 'unknown'}: Fuseki request failed (${response.status}):`, body);
      return;
    }

    let types = [...new Set(body.results.bindings.map(term => term.type.value))];

    for( let type of types ) {
      if( !(await esSparqlModel.hasModel(type)) ) continue;
      await this.insert(key, msg.subject, msg.msgId, msg, type);
      break;
    }
  }

  /**
   * @methd handleMessages
   * @description Called when no message has come in for 5s. Scans redis for
   * the indexer prefix keys
   */
  async handleMessages() {
    if( !this.run ) return;

    let options = {
      cursor: 0,
      pattern : config.redis.prefixes.indexer+'*',
      count : '1'
    };
    while( 1 ) {
      let res = await redis.scan(options);
      for( let key of res.keys ) {
        let msg = await redis.client.get(key);
        await this.index(key, msg);
      }

      if( !this.run || res.cursor == '0' ) break;
      options.cursor = res.cursor;
    }

    // now that we have finished indexing, check for commands
    await this.setAliasCmd();
    await this.deleteIndexCmd();

    await redis.client.save();
  }

  /**
   * @method setAliasCmd
   * @description Run the set-alias command
   */
  async setAliasCmd() {
    let payload;
    try {
      payload = await redis.client.get(config.redis.keys.setAlias);
      if( !payload ) return;
      payload = JSON.parse(payload);
      logger.info(`Setting alias ${config.elasticSearch.indexAlias} to ${payload.index}`);
      await elasticSearch.client.indices.putAlias({index: payload.index, name: config.elasticSearch.indexAlias});
      await redis.client.del(config.redis.keys.setAlias);
    } catch(e) {
      logger.error('Failed to run set-index', e);
    }
  }

  /**
   * @method deleteIndexCmd
   * @description run the delete-index command
   */
  async deleteIndexCmd() {
    let payload;
    try {
      payload = await redis.client.keys(config.redis.prefixes.deleteIndex+'*');
      if( !payload ) return;
      if( !payload.length ) return;

      for( let key of payload ) {
        let index = key.replace(config.redis.prefixes.deleteIndex, '');
        logger.info(`Removing index ${index}`);
        await elasticSearch.client.indices.delete({index});
        await redis.client.del(key);
      }

    } catch(e) {
      logger.error('Failed to run delete-index', payload, e);
    }
  }

}

module.exports = new Indexer();