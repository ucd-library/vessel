const {Producer, KeyedMessage, KafkaClient, Consumer} = require('kafka-node');
const config = require('./config');
const logger = require('./logger');

class Kafka {

  constructor() {
    
  }

  /**
   * @method connect
   * @description connect kafka client to kafka server.
   * 
   * @param {*} producer 
   */
  connect() {
    this.client = new KafkaClient({
      kafkaHost: config.kafka.host+':'+config.kafka.port
    });

    this.client.on('ready', () => {
      logger.info('kafka client ready');
    });
    this.client.on('error', e => {
      logger.error('kafka client error', e);
    });
  }

  /**
   * @method initProducer
   * @description create the Kafka producer object.  Required to
   * use the send() method
   */
  initProducer() {
    this.producer = new Producer(this.client);

    this.producer.on('ready', function () {
      logger.info('Kafka producer ready');
    });
    this.producer.on('error', function (err) {
      logger.error('Kafka producer error', err);
    });
  }

  /**
   * @method initConsumer
   * @description ensurse as list of topics are available to be consumed.
   * This should be called before the consume() method
   * 
   * @param {*} topics 
   */
  initConsumer(topics) {
    return new Promise((resolve, reject) => {
      this.client.createTopics(topics, (err, result) => {
        if( err ) {
          logger.error('Kafka topics failed to initialize', err);
          reject(e);
        } else {
          logger.info('Kafka Topics initialized', topics);
          resolve(result);
        }
      });
    });
  }


  consume(topics, options, cb) {
    let consumer = new Consumer(this.client, topics, options);

    consumer.on('ready', () => {
      logger.info('Kafka consumer ready', topics, options);
    });
    consumer.on('message', (msg) => this._handleMessage(consumer, options, msg, cb));
    consumer.resume();
  }

  async _handleMessage(consumer, options, msg, cb) {
    try {
      await cb(msg);
      if( options.autoCommit === false ) {
        consumer.commit(true, function(err, data) {
          console.log('commit:', err, data);
        });
      }
    } catch(e) {
      console.error('Failed to handle message', e);
    }
  }

  send(msgs, key) {
    if( !Array.isArray(msgs) ) {
      msgs = [msgs];
    }

    msgs.forEach(msg => {
      if( key ) {
        msg.messages = msg.messages.map(msg => new KeyedMessage(key, msg));
      }
      
      msg.timestamp = Date.now();
    });

    return new Promise((resolve, reject) => {
      this.producer.send(msgs, (error, data) => {
        if( error ) reject(error);
        else resolve(data);
      });
    });
  }

}

module.exports = new Kafka();