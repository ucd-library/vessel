const {sparql, kafka, redis, fuseki, config} = require('@ucd-lib/rp-node-utils');
const patchParser = require('./patch-parser');
const changes = require('./get-changes');

class Debouncer {

  constructor() {
    this.lastMessageTimer = null;
    this.run = false;
  }

  async connect() {
    await redis.connect();

    // see if there where messages left in redis
    this.run = true;
    this.handleMessages();

    await kafka.connect();
    await kafka.initConsumer([{
      topic: config.kafka.topics.rdfPatch,
      partitions: 1,
      replicationFactor: 1
    }]);

    kafka.consume(
      [{
        topic: config.kafka.topics.rdfPatch,
        partition: 0,
        offset: 7
      }],
      {
        autoCommit: false,
        fromOffset: true
      },
      this.onMessage
    );
  }

  async onMessage(msg) {
    this.run = false;

    let subjects = changes(patchParser(msg.value));
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
    });
  }

  async sendKey(key) {
    let received = await redis.client.get(key);

    await kafka.send({
      topic : config.kafka.topics.index,
      messages : [JSON.stringify({
        sender : 'debouncer',
        timestamp : Date.now(),
        received : received,
        subject : key.replace(config.redis.prefixes.debouncer, '')
      })]
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
      [options.cursor, 'MATCH', options.pattern, 'COUNT', options.pattern]
    );
    return {cursor: res[0], keys: res[1]};
  }

}

module.exports = new Debouncer();