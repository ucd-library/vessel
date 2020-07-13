const redis = require('redis');
const util = require('util');
const config = require('./config');
const logger = require('./logger');

const promisify = ['get', 'set', 'del', 'keys', 'expire', 'send_command'];

class RedisClient {

  _initClient() {
    this.client = redis.createClient({
      host: config.redis.host,
      port : config.redis.port
    });

    // Node Redis currently doesn't natively support promises (this is coming in v4)
    promisify.forEach(key => this.client[key] = util.promisify(this.client[key]));

    this.client.on('error', function (err) {
      logger.error('Redis client error', err);
    });
  }

  connect() {
    if( !this.client ) this._initClient();
  }

}

module.exports = new RedisClient();