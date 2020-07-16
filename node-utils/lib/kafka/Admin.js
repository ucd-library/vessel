const Kafka = require('node-rdkafka');

class Admin {

  constructor(config) {
    this.client = Kafka.AdminClient.create(config);
  }

  createTopic(opts) {
    return new Promise((resolve, reject) => {
      this.client.createTopic(opts, err => {
        if( err ) reject(err);
        else resolve();
      });
    });
  }

  disconnect() {
    this.client.disconnect();
  }

}

module.exports = Admin;