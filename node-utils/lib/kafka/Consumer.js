const Kafka = require('node-rdkafka');
const logger = require('../logger');

class Consumer {

  constructor(globalConfig, topicConfig) {
    this.client = new Kafka.KafkaConsumer(globalConfig, topicConfig);
    this.loopTimer = -1;
    this.loopInterval = 500;
    this.consuming = true;

    this.errorConsumeCount = 0;
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
      try {
        if( !this.consuming ) break;

        let result = await this.consumeOne();
        this.errorConsumeCount = 0;

        if( result ) await callback(result);
        else await this._sleep();
      } catch(e) {
        // TODO: look to use delay library!
        logger.error('kafka consume error', e);
        await this._sleep(this.errorConsumeCount*this.loopInterval);
      }
    }
  }

  /**
   * @method consumeOne
   * @description attempt to pull one message off topic
   */
  consumeOne() {
    return new Promise((resolve, reject) => {
      this.client.consume(1, (e, msgs) => {
        if( e ) reject(e);
        else if( !msgs.length ) resolve(null);
        else resolve(msgs[0]);
      });
    });
  }

  /**
   * @method _sleep
   * @description simple setTimeout promise wrapper
   * 
   * @param {Number} time Optional.  Specify time to sleep
   */
  _sleep(time) {
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(), time || this.loopInterval);
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
        else resolve(data);
      });
    });
  }

  /**
   * @method disconnect
   * @description disconnect client
   * 
   * @return {Promise}
   */
  disconnect() {
    return new Promise((resolve, reject) => {
      this.client.disconnect((err, data) => {
        if( err ) reject(err);
        else resolve(data);
      });
    });
  }

  /**
   * @method assign
   * @description assign client top topic/partition/offset triples
   * 
   * @param {String|Object|Array} topic 
   */
  // assign(topic) {
  //   topic = this._topicHelper(topic);
  //   this.client.assign(topic);
  // }

  subscribe(topics) {
    return this.client.subscribe(topics);
  }

  /**
   * @method committed
   * @description get committed offset for topic/partition
   * 
   * @param {String|Object|Array} topic 
   */
  // committed(topic) {
  //   topic = this._topicHelper(topic);

  //   return new Promise((resolve, reject) => {
  //     this.client.committed(topic, 10000, (err, result) => {
  //       if( err ) reject(err);
  //       else resolve(result);
  //     });
  //   });
  // }
  committed(topic, attempt=0) {
    topic = this._topicHelper(topic);

    return new Promise((resolve, reject) => {
      this.client.committed(topic, 10000, (err, result) => {
        if( err && attempt < 10 ) {
          logger.warn('Failed to get get committed offset, will try again.  attempt='+attempt, err, result);
          setTimeout(async () => {
            try {
              attempt++;
              resolve(await this.committed(topic, attempt))
            } catch(e) { reject(e) }
          }, 1000);
          return;
        }

        // logger.info('committed offset result', topic, err, result);
        if( err ) reject(err);
        else resolve(result);
      });
    });
  }

  /**
   * @method queryWatermarkOffsets
   * @description get watermark offsets for topic/partition
   * 
   * @param {String|Object} topic 
   */
  queryWatermarkOffsets(topic) {
    if( typeof topic === 'string' ) topic = {topic};
    if( !topic.partition ) topic.partition = 0; 
    
    return new Promise((resolve, reject) => {
      this.client.queryWatermarkOffsets(topic.topic, topic.partition, 10000, (err, offsets) => {
        if( err ) reject(err);
        else resolve(offsets);
      });
    });
  }

  /**
   * @method _topicHelper
   * @description given a topic as a string or object, ensures the topic
   * is a Array or objects that have the partition set to 0.  This structure
   * is how most methods of kafka library expect topics.
   * 
   * @param {Object|String} topic 
   * 
   * @returns {Array}
   */
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