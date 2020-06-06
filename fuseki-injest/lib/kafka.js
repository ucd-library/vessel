const {Producer, KeyedMessage, KafkaClient, Consumer} = require('kafka-node');

class Kafka {

  constructor() {
    this.client = new KafkaClient({kafkaHost: 'kafka:9092'});
    this.producer = new Producer(this.client);

    this.client.createTopics([{
      topic: 'fuseki-updates',
      partitions: 1,
      replicationFactor: 1
    }], (err, result) => {
      if( err ) console.error(err);
      else console.log(result);

      this.consumer = new Consumer(this.client, 
        [{ topic: 'fuseki-updates', partition: 0}], 
        {autoCommit: false}
      )
      this.consumer.on('message', (msg) => {
        console.log('Consumer message: ', JSON.parse(msg.value));
        
        this.consumer.commit(true, function(err, data) {
          console.log('commit:', err, data);
        });
      });
  });


    this.producer.on('ready', function () {
      console.log('Kafka producer ready');
    });
    this.producer.on('error', function (err) {
      console.error('Kafka producer error', err);
    });
    
  }

  send(msgs) {
    if( !Array.isArray(msgs) ) {
      msgs = [msgs];
    }

    msgs.forEach(msg => {
      msg.timestamp = Date.now();
    });

    return new Promise((resolve, reject) => {
      this.producer.send(msgs, (error, data) => {
        if( error ) reject(error);
        else resolve(data);
      });
    });
  }

  consume(callback) {

  }


}

module.exports = new Kafka();