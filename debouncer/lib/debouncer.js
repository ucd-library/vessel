const {kafka, redis, logger, config, Status, fuseki, esSparqlModel} = require('@ucd-lib/rp-node-utils');
const patchParser = require('./patch-parser');
const changes = require('./get-changes');

const redisEvents = new redis.RedisClient();

class Debouncer {

  constructor() {
    this.lastMessageTimer = null;
    this.run = true;

    this.EXPIRE_PREFIX = 'expire-';

    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.debouncer,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
      // subscribe to front of committed offset
      'auto.offset.reset' : 'earliest'
    });

    this.kafkaReindexConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.debouncer,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
      // subscribe to front of committed offset
      'auto.offset.reset' : 'earliest'
    })

    this.status = new Status({producer: 'debouncer'});

    // check for any expired messages
    setInterval(() => this.cleanup(), 30*1000);
  }

  /**
   * @method connect
   * @description connect to redis and kafka, ensure kafka topcs, query for kafka watermarks,
   * query for kafka committed offset, start listening to kafka stream from last committed offset.
   * Finally, after a small delay, check to see if any messages are stashed in redis that were 
   * never executed
   * 
   * @returns {Promise}
   */
  async connect() {
    await redis.connect();
    await redisEvents.connect();

    logger.info('Listening to redis key events')
    redisEvents.client.config('set','notify-keyspace-events','Ex');
    redisEvents.client.subscribe('__keyevent@0__:expired');
    redisEvents.client.on('message', (channel, key) => {
      if( channel !== '__keyevent@0__:expired' ) return;
      key = key.replace(this.EXPIRE_PREFIX+config.redis.prefixes.debouncer, '');
      this.sendKey(key);
    });

    await this.kafkaConsumer.connect();
    await this.kafkaReindexConsumer.connect();
    await this.kafkaProducer.connect();

    let topics = [
      config.kafka.topics.rdfPatch,
      config.kafka.topics.index,
      config.kafka.topics.reindex
    ];
    
    logger.info('waiting for topics: ', topics);
    await this.kafkaReindexConsumer.waitForTopics(topics);
    logger.info('topics ready: ', topics);

    await this.kafkaConsumer.subscribe([config.kafka.topics.rdfPatch]);
    await this.kafkaReindexConsumer.subscribe([config.kafka.topics.reindex]);
    this.kafkaProducer.client.setPollInterval(config.kafka.producerPollInterval);

    await this.status.connect();
    this.listen();
    this.listenReindex();
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      logger.error('kafka consume patch error', e);
    }
  }

  async listenReindex() {
    try {
      await this.kafkaReindexConsumer.consume(msg => this.onReindexMessage(msg));
    } catch(e) {
      logger.error('kafka consume reindex error', e);
    }
  }

  /**
   * @method onMessage
   * @description handle a kafka message.  Messages should be the raw patch from the
   * kafka-fuseki-connector extension.  This method parses the rdf patch and makes a 
   * unqiue list of all subject and object uris, places the uris in redis, resets
   * the message handler timeout (the main part of the debouncer).
   * 
   * @param {Object} msg kafka message
   */
  async onMessage(msg) {
    this.run = false;

    logger.info(`handling kafka message: ${kafka.utils.getMsgId(msg)}`);

    let subjects;
    try {
      // subjects is a key/value pair.  key is subject, value is array of types from patch, if found
      subjects = changes(patchParser(msg.value.toString('utf-8')));
    } catch(e) {
      logger.error(`failed to parse rdf patch. message: ${kafka.utils.getMsgId(msg)}`, e.message, msg.value.toString('utf-8'));
      return;
    }

    // now query fuseki for additional types not sent in patch
    await this.getTypes(subjects);
    let validType;

    for( let subject in subjects ) {
      validType = await this.validModel(subjects[subject]);

      // sending status messages for ignored is too noisy to handle :(
      if( !validType ) {
        continue;
      }
      
      await this.startDebounceDelay(subject);
    }
  }

  async onReindexMessage(msg) {
    let subject;

    try {
      // subjects is a key/value pair.  key is subject, value is array of types from patch, if found
      subject = JSON.parse(msg.value.toString('utf-8')).subject;
    } catch(e) {
      logger.error(`failed to parse reindex. message: ${kafka.utils.getMsgId(msg)}`, e.message, msg.value.toString('utf-8'));
      return;
    }

    await this.startDebounceDelay(subject);
  }

  /**
   * @method startDebounceDelay
   * @description set that the key is about to be debounced
   * 
   * @param {*} subject 
   */
  async startDebounceDelay(subject) {
    this.status.send({
      status: this.status.STATES.START,
      index: await redis.client.get(config.redis.keys.indexWrite),
      subject
    });
    await redis.client.set(config.redis.prefixes.debouncer+subject,  Date.now());
    await redis.client.set(this.EXPIRE_PREFIX+config.redis.prefixes.debouncer+subject,  Date.now());
    await redis.client.expire(
      this.EXPIRE_PREFIX+config.redis.prefixes.debouncer+subject,  
      config.debouncer.handleMessageDelay + Math.round(Math.random() * 5)
    );
  }

  /**
   * @method sendKey
   * @description Called from the main handleMessages loop. Handles the redis key
   * message by parsing out the subject, sending the subject to the kafka indexer topic
   * and finally deleting the redis key.
   * 
   * @param {String} subject redis key 
   * 
   * @return {Promise}
   */
  async sendKey(subject) {
    logger.info('Sending subject to indexer: ', subject);

    this.status.send({
      status: this.status.STATES.COMPLETE, 
      index: await redis.client.get(config.redis.keys.indexWrite),
      subject
    });

    this.kafkaProducer.produce({
      topic : config.kafka.topics.index,
      value : {
        sender : 'debouncer',
        subject
      },
      key : 'debouncer'
    });

    await redis.client.del(config.redis.prefixes.debouncer+subject);
  }

  async getTypes(subjects) {
    let response = await fuseki.query(`select * where { 
      values ?subject { <${Object.keys(subjects).join('> <')}> }
      ?subject <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type
    }`)
    
    let bodyText, body;
    bodyText = await response.text();
    body = JSON.parse(bodyText);

    body.results.bindings.map(term => {
      return {subject: term.subject.value, type: term.type.value}
    })
    .forEach(item => {
      if( !subjects[item.subject].includes(item.type) ) {
        subjects[item.subject].push(item.type);
      }
    });
  }

  async validModel(types) {
    if( !Array.isArray(types) ) types = [types];

    for( let type of types ) {
      if( (await esSparqlModel.hasModel(type)) ) {
        return true;
      }
    }

    return false;
  }

  /**
   * @method cleanup
   * @description every 30s scan all keys and check for any expired debounce keys
   * 
   * @returns {Promise}.
   */
  async cleanup() {
    let options = {
      cursor: 0,
      pattern : config.redis.prefixes.debouncer+'*',
      count : '1'
    };

    while( 1 ) { // Yes!
      let res = await redis.scan(options);
      for( let key of res.keys ) {
        let value = parseInt(await redis.client.get(key));
        if( Date.now() - value < (config.debouncer.handleMessageDelay * 4) ) continue;
        key = key.replace(config.redis.prefixes.debouncer, '');
        logger.info('Sending unhandled key; ',  key, Math.floor((Date.now() - value) / 1000) +' seconds old');
        await this.sendKey(key.replace(config.redis.prefixes.debouncer, ''));
      }

      if( res.cursor === '0' ) break;
      options.cursor = res.cursor;
    }
  }


}

module.exports = new Debouncer();