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
      'enable.auto.commit': true
    })
  }

  async connect() {
    await redis.connect();

    try {
      await this.kafkaProducer.connect();
      await this.kafkaConsumer.connect();

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

  async sendKey(key) {
    console.log('Sending subject to indexer: ', key.replace(config.redis.prefixes.debouncer, ''));
    let received = await redis.client.get(key);

    this.kafkaProducer.produce({
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

  async handleMessages() {
    if( !this.run ) return;

    let options = {cursor: 0};
    while( 1 ) {
      let res = await this.scan(options);
      for( let key of res.keys ) {
        await this.sendKey(key);
      }

      if( !this.run || res.cursor == '0' ) break;
      options.cursor = res.cursor;
    }
  }

  // TODO: scan might have us redoing A LOT of work!
  // Keys returns key set, but adds $$
  async scan(options) {
    options = Object.assign({
      cursor : '0',
      pattern : config.redis.prefixes.debouncer+'*',
      count : '1'
    }, options);

    let res = await redis.client.send_command(
      'scan', 
      [options.cursor, 'MATCH', options.pattern, 'COUNT', options.count]
    );
    return {cursor: res[0], keys: res[1]};
  }

}

module.exports = new Debouncer();