const {kafka, redis, fuseki, sparql, logger, config} = require('@ucd-lib/rp-node-utils');
const elasticSearch = require('./elastic-search');

class Indexer {

  constructor() {
    this.lastMessageTimer = null;
    this.run = true;

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.index,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      'enable.auto.commit': true
    })
  }

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

      // assign to front of committed offset
      await this.kafkaConsumer.assign(topics);
    } catch(e) {
      console.error('kafka init error', e);
    }

    this.listen();

    setTimeout(() => {
      this.handleMessages();
    }, 1000);
  }

  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      console.error('kafka consume error', e);
    }
  }

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

    // unlike the debouncer, lookup subject types 
    // we will only debounce known types
    if( !payload.type || payload.types ) {
      let response = await fuseki.query(`select * { GRAPH ?g {<${payload.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}}`)
    
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

    let modelType = this.getKnownModelType(payload);
    if( !modelType ) {
      logger.info(`Ignoring message ${payload.msgId} with subject ${payload.subject} sent by ${payload.sender || 'unknown'}: Type has no model ${payload.type} ${JSON.stringify(payload.types || [])}`);
      return; // ignore. TODO: do we want to log this?
    }

    // If force flag, directly index.  Don't debounce.
    if( payload.force ) {
      await this.index(payload);
      return;
    }

    await redis.client.set(config.redis.prefixes.indexer+payload.subject, JSON.stringify(payload));

    this.resetMessageDelayHandler();
  }

  getKnownModelType(msg) {
    if( msg.type && sparql.TYPES[msg.type] ) {
      return msg.type;
    }
    if( msg.types ) {
      for( let type of msg.types ) {
        if( sparql.TYPES[type] ) return type;
      }
    }

    return null;
  }

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
    logger.info(`From ${id} sent by ${msg.sender || 'unknown'} loading ${uri} with model ${type}. ${msg.force ? 'force=true' : ''}`);
    let result = await sparql.getModel(type, uri);
    await elasticSearch.insert(result.model);
    logger.info('Updated', uri);
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
    if( msg.type && sparql.TYPES[msg.type] ) {
      await this.insert(key, msg.subject, msg.msgId, msg, msg.type);
      return;
    }

    let response = await fuseki.query(`select * { GRAPH ?g {<${msg.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}}`)
    
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
      if( !sparql.TYPES[type] ) continue;
      await this.insert(key, msg.subject, msg.msgId, msg, type);
      break;
    }
  }


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
  }


}

module.exports = new Indexer();