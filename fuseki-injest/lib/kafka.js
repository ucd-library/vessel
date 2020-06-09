const {Producer, KeyedMessage, KafkaClient, Consumer} = require('kafka-node');

class Kafka {

  constructor() {
    this.client = new KafkaClient({kafkaHost: 'kafka:9092'});
    this.producer = new Producer(this.client);

    this.producer.on('ready', function () {
      console.log('Kafka producer ready');
    });
    this.producer.on('error', function (err) {
      console.error('Kafka producer error', err);
    });
    
  }

  send(msgs, source) {
    if( !Array.isArray(msgs) ) {
      msgs = [msgs];
    }

    msgs.forEach(msg => {
      msg.messages = msg.messages.map(msg => new KeyedMessage('source-'+source, msg));
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