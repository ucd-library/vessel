const kafka = require('@ucd-lib/node-kafka');
const config = require('./config');
const logger = require('./logger');

/**
 * Helper for sending kafka status messages
 */
class Status {

  constructor(opts={}) {
    this.options = opts;

    if( opts.producer ) {
      this.kafkaProducer = new kafka.Producer({
        'metadata.broker.list': config.kafka.host+':'+config.kafka.port
      });
    }

    if( opts.consumer ) {
      this.kafkaConsumer = new kafka.Consumer({
        'group.id': opts.consumer,
        'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      },{
        // subscribe to front of committed offset
        'auto.offset.reset' : 'earliest'
      });
    }
  }

  async connect() {
    if( this.kafkaConsumer ) {
      await this.kafkaConsumer.connect();
    }
    if( this.kafkaProducer ) {
      await this.kafkaProducer.connect();
      this.kafkaProducer.client.setPollInterval(config.kafka.producerPollInterval);
    }

    let client = this.kafkaConsumer || this.kafkaProducer || null;
    if( client ) {
      logger.info('waiting for status topic: ', config.kafka.topics.status);
      await client.waitForTopics(config.kafka.topics.status);
      logger.info('status topic ready: ', config.kafka.topics.status);
    }
  
    if( this.kafkaConsumer ) {
      await this.kafkaConsumer.subscribe([config.kafka.topics.status]);
      await this.kafkaConsumer.consume(msg => this._onMessage(msg));
    }
  }

  send(msg={}) {
    msg.sender = this.options.producer;

    return this.kafkaProducer.produce({
      topic : config.kafka.topics.status,
      value : msg
    });
  }

  _onMessage(msg) {
    msg = JSON.parse(msg.value.toString('utf-8'));
    this.options.onMessage(msg);
  }

}

module.exports = Status