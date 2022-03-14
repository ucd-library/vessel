const redis = require('redis');
const util = require('util');
const config = require('./config');
const logger = require('./logger');
const waitUntil = require('./wait-until');

// commands we want to wrap in promises, feel free to add to this list
const promisify = ['get', 'set', 'del', 'keys', 'expire', 'send_command', 'save'];

class RedisClient {

  async _initClient() {
    await waitUntil(config.redis.host, config.redis.port);

    this.client = redis.createClient({
      host: config.redis.host,
      port : config.redis.port
    });

    // Node Redis currently doesn't natively support promises (this is coming in v4)
    promisify.forEach(key => this.client[key] = util.promisify(this.client[key]));

    this.client.on('error', (err) => {
      logger.error('Redis client error', err);
    });
    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });
    this.client.on('end', () => {
      logger.info('Redis client closed connection');
    });
    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  /**
   * @method connect
   * @description create/connect redis client
   */
  connect() {
    if( !this.client ) {
      return this._initClient();
    }
  }

  /**
   * @method disconnect
   * @description disconnect redis client
   * 
   * @returns {Promise}
   */
  disconnect() {
    return new Promise((resolve, reject) => {
      this.client.quit(() => resolve());
    });
  }

  /**
   * @method scan
   * @description wrapper for https://redis.io/commands/scan
   * 
   * @param {Object} options 
   * @param {Number} options.curser
   * @param {String} options.pattern
   * @param {Number} options.count
   */
  async scan(options={}) {
    let res = await this.client.send_command(
      'scan', 
      [options.cursor, 'MATCH', options.pattern, 'COUNT', options.count]
    );
    return {cursor: res[0], keys: res[1]};
  }

}

let client = new RedisClient();
client.RedisClient = RedisClient;
module.exports = client;