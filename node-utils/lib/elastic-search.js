const {Client} = require('elasticsearch');
const waitUntil = require('./wait-until');
const config = require('./config');
const logger = require('./logger');

class ElasticSearch {
  /**
   * @method isConnected
   * @description make sure we are connected to elasticsearch
   */
  async isConnected() {
    if( this.connected ) return;

    logger.info('waiting for es connection');
    await waitUntil(config.elasticSearch.host, config.elasticSearch.port);

    // sometimes we still aren't ready....
    try {
      await this.client.ping({requestTimeout: 5000});
      this.connected = true;
    } catch(e) {
      logger.error(e)
      await this.isConnected();
    }
  }

  /**
   * @method connect
   * @description connect to elasticsearch and ensure collection indexes
   */
  async connect() {
    if( !this.client ) {
      this.client = new Client({
        host: `http://${config.elasticSearch.username}:${config.elasticSearch.password}@${config.elasticSearch.host}:${config.elasticSearch.port}`,
        requestTimeout : config.elasticSearch.requestTimeout
      });
    }

    await this.isConnected();
    logger.error('Connected to Elastic Search');
  }

}

module.exports = new ElasticSearch();