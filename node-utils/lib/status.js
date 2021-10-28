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

    this.STATES = {
      START : 'start',
      RUNNING : 'running',
      ERROR : 'error',
      COMPLETE : 'complete'
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
    if( Array.isArray(msg) ) {
      msg.forEach(item => this._messageAdditions(item));
    } else {
      this._messageAdditions(msg)
    }

    return this.kafkaProducer.produce({
      topic : config.kafka.topics.status,
      value : msg
    });
  }

  _messageAdditions(msg) {
    msg.service = this.options.producer;
    msg.timestamp = Date.now();
  }

  _onMessage(msg) {
    msg = JSON.parse(msg.value.toString('utf-8'));
    return this.options.onMessage(msg);
  }

}

module.exports = Status