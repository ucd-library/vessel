const Kafka = require('node-rdkafka');

class Consumer {

  constructor(config) {
    this.client = new Kafka.KafkaConsumer(config);
    this.loopTimer = -1;
    this.loopInterval = 500;
    this.consuming = true;
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
   * @method consume
   * @description Attempts to consume one message at a time.  Callback function should
   * return a promise and consume loop will wait until promise resolves to continue.
   * If there are no messages on topic, will pull this.loopInterval (default 500ms)
   * for a message.  If there are message, the next message will be read immediately.
   * 
   * @param {function} callback 
   */
  async consume(callback) {
    while( 1 ) {
      if( !this.consuming ) break;

      let result = await this.consumeOne();

      if( result ) await callback(result);
      else await this._sleep();
    }
  }

  /**
   * @method consumeOne
   * @description attempt to pull one message off topic
   */
  consumeOne() {
    return new Promise((resolve, reject) => {
      consumer.consume(1, (e, msgs) => {
        if( e ) reject(e);
        else if( !msgs.length ) resolve(null);
        else resolve(msgs[0]);
      });
    });
  }

  _sleep() {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), this.loopInterval);
    });
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

  /**
   * @method assign
   * @description assign client top topic/partition/offset triples
   * 
   * @param {String|Object|Array} topic 
   */
  assign(topic) {
    topic = this._topicHelper(topic);
    this.client.assign(topic);
  }

  /**
   * @method committed
   * @description get committed offset for topic/partition
   * 
   * @param {String|Object|Array} topic 
   */
  committed(topic) {
    topic = this._topicHelper(topic);

    return new Promise((resolve, reject) => {
      this.client.committed(topic, 0, (err, result) => {
        if( err ) reject(err);
        else resolve(result);
      });
    });
  }

  /**
   * @method committed
   * @description get watermark offsets for topic/partition
   * 
   * @param {String|Object} topic 
   */
  queryWatermarkOffsets(topic) {
    if( typeof topic === 'string' ) topic = {topic};
    if( !topic.partition ) topic.partition = 0; 
    
    return new Promise((resolve, reject) => {
      this.client.queryWatermarkOffsets(topic.topic, topic.partition, 0, (err, offsets) => {
        if( err ) reject(err);
        else resolve(offsets);
      });
    });
  }

  _topicHelper(topic) {
    if( typeof topic === 'string' ) topic = {topic};
    if( !Array.isArray(topic) ) topic = [topic];
    
    topic.forEach(t => {
      if( !t.partition ) t.partition = 0; 
    });

    return topic;
  }

}

module.exports = Consumer;