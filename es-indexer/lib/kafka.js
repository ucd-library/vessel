const {Producer, KeyedMessage, KafkaClient, Consumer} = require('kafka-node');

class Kafka {

  constructor() {
    this.client = new KafkaClient({kafkaHost: 'kafka:9092'});
    this.topics = [{
      topic: 'fuseki-updates',
      partitions: 1,
      replicationFactor: 1
    }];
  }

  consume(cb) {
    return new Promise((resolve, reject) => {
      this.client.createTopics(this.topics, (err, result) => {
        console.log('Connected to topic');

        this.consumer = new Consumer(this.client, 
          [{ topic: 'fuseki-updates', partition: 0}], 
          {autoCommit: false}
        );

        this.consumer.on('message', (msg) => this._handleMessage(msg, cb));
        resolve();
      });
    });
  }

  async _handleMessage(msg, cb) {
    try {
      await cb(msg);
      this.consumer.commit(true, function(err, data) {
        console.log('commit:', err, data);
      });
    } catch(e) {
      console.error('Failed to handle message', e);
    }
  }


}

module.exports = new Kafka();