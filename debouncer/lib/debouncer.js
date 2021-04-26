const {kafka, redis, logger, config} = require('@ucd-lib/rp-node-utils');
const patchParser = require('./patch-parser');
const changes = require('./get-changes');

class Debouncer {

  constructor() {
    this.lastMessageTimer = null;
    this.run = true;

    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    })

    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.debouncer,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
      'auto.offset.reset' : 'earliest'
    })
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

    try {
      await this.kafkaConsumer.connect();
      await this.kafkaProducer.connect();
      

      await kafka.utils.ensureTopic({
        topic : config.kafka.topics.rdfPatch,
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});
      await kafka.utils.ensureTopic({
        topic : config.kafka.topics.index,
        num_partitions: 1,
        replication_factor: 1
      }, {'metadata.broker.list': config.kafka.host+':'+config.kafka.port});

      let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(config.kafka.topics.rdfPatch);
      let topics = await this.kafkaConsumer.committed(config.kafka.topics.rdfPatch);
      logger.info(`Debouncer (group.id=${config.kafka.groups.debouncer}) kafak status=${JSON.stringify(topics)} watermarks=${JSON.stringify(watermarks)}`);

      // subscribe to front of committed offset
      await this.kafkaConsumer.subscribe([config.kafka.topics.rdfPatch]);
    } catch(e) {
      logger.error('kafka init error', e);
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
      logger.error('kafka consume error', e);
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
      subjects = changes(patchParser(msg.value.toString('utf-8')));
    } catch(e) {
      logger.error(`failed to parse rdf patch. message: ${kafka.utils.getMsgId(msg)}`, e.message, msg.value.toString('utf-8'));
      return;
    }

    let now = Date.now();
    for( let subject of subjects ) {
      await redis.client.set(config.redis.prefixes.debouncer+subject, now);
    }

    this.resetMessageDelayHandler();
  }

  /**
   * @method resetMessageDelayHandler
   * @description reset the timer for the main handleMessages loop. Defaults to 5s.
   * So there must be no messages for 5s before messages are handled.  A new message
   * in the handleMessage loop will break the loop and reset the timer.
   */
  resetMessageDelayHandler() {
    if( this.lastMessageTimer ) {
      clearTimeout(this.lastMessageTimer);
    }

    this.lastMessageTimer = setTimeout(() => {
      this.lastMessageTimer = null;
      this.run = true;
      this.handleMessages();
    }, config.debouncer.handleMessageDelay * 1000);
  }

  /**
   * @method sendKey
   * @description Called from the main handleMessages loop. Handles the redis key
   * message by parsing out the subject, sending the subject to the kafka indexer topic
   * and finally deleting the redis key.
   * 
   * @param {String} key redis key 
   * 
   * @return {Promise}
   */
  async sendKey(key) {
    logger.info('Sending subject to indexer: ', key.replace(config.redis.prefixes.debouncer, ''));
    let received = await redis.client.get(key);

    await this.kafkaProducer.produce({
      topic : config.kafka.topics.index,
      value : {
        sender : 'debouncer',
        debouncerRecievedTimestamp : received,
        subject : key.replace(config.redis.prefixes.debouncer, '')
      },
      key : 'debouncer'
    });

    await redis.client.del(key);
  }

  /**
   * @method handleMessages
   * @description Called when no message has come in for 5s. Scans redis for
   * the debouncer prefix keys, keys are handled in sendKey() method.  Main loop
   * breaks if the this.run flag is set to false (see onMessage)
   * 
   * @returns {Promise}.
   */
  async handleMessages() {
    if( !this.run ) return;

    let options = {
      cursor: 0,
      pattern : config.redis.prefixes.debouncer+'*',
      count : '1'
    };

    while( 1 ) { // Yes!
      let res = await redis.scan(options);
      for( let key of res.keys ) {
        await this.sendKey(key);
      }

      if( !this.run || res.cursor == '0' ) break;
      options.cursor = res.cursor;
    }
  }


}

module.exports = new Debouncer();