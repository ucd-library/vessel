const {kafka, redis, config} = require('@ucd-lib/rp-node-utils');
const patchParser = require('./patch-parser');
const changes = require('./get-changes');

class Debouncer {

  constructor() {
    this.lastMessageTimer = null;
    this.run = false;

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

    // see if there where messages left in redis
    this.run = true;
    this.handleMessages();

    await this.kafkaProducer.connect();
    await this.kafkaConsumer.connect();

    await this.kafkaConsumer.ensureTopic({
      topic : config.kafka.topics.rdfPatch,
      num_partitions: 1,
      replication_factor: 1
    });
    await this.kafkaConsumer.ensureTopic({
      topic : config.kafka.topics.index,
      num_partitions: 1,
      replication_factor: 1
    })

    // assign to front of committed offset
    await this.kafkaConsumer.assign(
      await this.kafkaConsumer.committed(config.kafka.topics.rdfPatch)
    );

    this.kafkaConsumer.consume(msg => this.onMessage(msg));
  }

  async onMessage(msg) {
    this.run = false;

    let subjects = changes(patchParser(msg.value));
    // console.log('debouncer subjects received: ', patchParser(msg.value));
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
    console.log('Debouncer sending subject to index: ', key.replace(config.redis.prefixes.debouncer, ''));
    let received = await redis.client.get(key);

    kafka.produce({
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

    while( 1 ) {
      let res = await this.scan();
      for( let key of res.keys ) {
        await this.sendKey(key);
      }

      if( !this.run || res.cursor == '0' ) break;
    }
  }

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