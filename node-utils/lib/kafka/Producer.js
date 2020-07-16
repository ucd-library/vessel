const Kafka = require('node-rdkafka');
const Admin = require('./Admin');

class Producer {

  constructor(config) {
    this.config = config;
    this.client = new Kafka.Producer(config);
  }

  async ensureTopic(topic) {
    let admin = new Admin({
      'metadata.broker.list': this.config['metadata.broker.list']
    });

    try {
      await admin.createTopic(topic);
    } catch(e) {}

    admin.disconnect();
  }

  /**
   * @method connect
   * @description connect client
   * 
   * @param {Object} opts 
   */
  connect(opts={}) {
    return new Promise((resolve, reject) => {
      this.client.connect(opts, (err, data) => {
        if( err ) reject(err);
        else resolve(err);
      });
    });
  }

  produce(msg) {
    if( typeof msg.value === 'object' && !(msg.value instanceof Buffer)) {
      msg.value = JSON.stringify(msg.value);
    }
    if( typeof msg.value === 'string' ) {
      msg.value = Buffer.from(msg.value);
    }

    this.produce(msg.topic, null, msg.value, msg.key, Date.now());
  }

}

module.exports = Producer;