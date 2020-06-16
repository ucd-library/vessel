const {Producer, KeyedMessage, KafkaClient, Consumer} = require('kafka-node');
const config = require('./config');

class Kafka {

  constructor() {
    
  }

  init(producer=false) {
    this.client = new KafkaClient({
      kafkaHost: config.kafka.host+':'+config.kafka.port
    });
    if( producer ) this.initProducer();
  }

  initProducer() {
    this.producer = new Producer(this.client);

    this.producer.on('ready', function () {
      console.log('Kafka producer ready');
    });
    this.producer.on('error', function (err) {
      console.error('Kafka producer error', err);
    });
  }

  initConsumer(topics) {
    return new Promise((resolve, reject) => {
      this.client.createTopics(topics, (err, result) => {
        console.log('Kafka Topics initialized');
        resolve();
      });
    });
  }


  consume(topics, options, cb) {
    let consumer = new Consumer(this.client, topics, options);
    consumer.on('message', (msg) => this._handleMessage(consumer, options, msg, cb));
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