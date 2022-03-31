const {kafka, fuseki, logger, config, metrics} = require('@ucd-lib/rp-node-utils');
const gcs = require('./gcs');
const pubsub = require('./pubsub');

/**
 * @class GCSIndexerModel
 * @description reads from google cloud buckets and inserts into fuseki, operations and batched
 * and when a batch completes, a message is sent to indexer about updated ids
 */
class GCSIndexerModel {

  constructor() {
    this.kafkaProducer = new kafka.Producer({
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port
    });
    metrics.ensureMetrics();

    this.checkPubSub();
  }

  checkPubSub() {
    pubsub.process(
      config.google.storage.pubsub.topic,
      config.google.storage.pubsub.batchSize,
      (msg, index, total) => this.batchedPubSubMessageIterator(msg, index, total)
    );
  }

  async batchedPubSubMessageIterator(msg, index, total) {
    if( msg ) await this.handlePubSubMsg(msg);

    // we are not at the end of current request
    if( index !== total ) return;

    // there may be more messages waiting, fire right away
    if( total === config.google.storage.pubsub.batchSize ) {
      this.checkPubSub()
    // give a break
    } else {
      setTimeout(() => this.checkPubSub(), 2000);
    }
  }

  async handlePubSubMsg(msg) {
    console.log(msg);

    let type = msg.name.split('/')[0];
    if( !config.google.storage.types.includes(type) ) {
      logger.info(`Ignoring pubsub update for message: ${msg.name} with unknown type: ${type}`);
      return;
    }

    let action = 'updated';

    // Not handling for now, this could be update or delete
    // as updates send a along a delete revision message
    if( msg.timeDeleted ) {
      let [exists] = await gcs.file(msg.name).exists();

      if( !exists ) {
        action = 'deleted';
      } else {
        // this condition means the object was updated, and
        // this message represents the deleted object.  Another
        // message will come in representing the 'new' updated
        // object.  So we can ignore this message.
        return; 
      }
    }

    if( msg.timeCreated === msg.updated ) {
      action = 'created';
    }

    // msg actions: 
    if( action !== 'deleted' ) {
      // send along filename to reindex, method will strip .json
      await this.reindexIds(msg.name);
    }
  }

  /**
   * @method connect
   * @description connect to redis, kafka and elastic search. Ensure kafka topic.  Query 
   * for kafka watermarks and last commited offset.  Register consumer to last committed 
   * offset and start reading kafka stream.  After a small delay, check to see if any messages 
   * are stashed in redis that were never executed
   */
  async connect() {

    await this.kafkaProducer.connect();

    let topics = [config.kafka.topics.gcs];
    logger.info('waiting for topics: ', topics);
    await this.kafkaProducer.waitForTopics(topics);
    logger.info('topics ready: ', topics);


    this.kafkaProducer.client.setPollInterval(config.kafka.producerPollInterval);
  }

  /**
   * @method getFiles
   * @description helper method to get file type counts.  Mostly used for
   * admin / status UI.
   * 
   * @returns {Promise<Object>} Resolves to key/value Object, key is type, value is count
   */
  async getFiles() {
    let resp = {
      bucket : config.google.storage.bucket,
      type : {}
    };
    for( let type of config.google.storage.types ) {
      resp.type[type] = (await gcs.getTypeFiles(type)).map(file => file.name);
    }
    return resp;
  }

  async reindexAll(triggeredBy='not set', type) {
    if( !type ) type = 'ALL';
    logger.info('Starting reindex of '+type+' gcs data, bucket='+config.google.storage.bucket);

    let files = [];
    if( type === 'ALL' ) {
      for( type of config.google.storage.types ) {
        files = [...files, ...(await gcs.getTypeFiles(type))];
      }
    } else {
      files = await gcs.getTypeFiles(type);
    }

    await this.reindexIds(files, triggeredBy);
  }

  /**
   * @method reindexIds
   * @description pull from gcs .json files into fuseki.  Method should be 
   * provided array of aggie experts ids (w/ or w/o prefix, it will be striped).
   * GCS bucket should have the format [type]/[id].json.  Type flag is informational
   * and should be one of: api, user, gc-pubsub 
   * 
   * @param {Array} ids Aggie Expert ids to harvest or gcs file objects
   * @param {String} triggeredBy should be one of: api, user, gc-pubsub 
   */
  async reindexIds(ids, triggeredBy='not set') {
    if( !Array.isArray(ids) ) ids = [ids];

    logger.info('Starting reindex of '+ids.length+' id(s)');
    
    let files = ids;
    if( typeof files[0] !== 'object' ) {
      files = ids
        .map(id => id.replace(/.*:/, ''))
        .map(id => !id.match(/\.json$/) ? id+'.json' : id)
        .map(filename => gcs.file(filename));
    }

    let successIds = [];

    await gcs.parallelDownload(
      files, {concurrent:4}, 
      (error, file, contents) => this._onFileDownload(error, file, contents, successIds)
    );

    this.kafkaProducer.produce({
      topic : config.kafka.topics.gcs,
      value : {ids: successIds, task:'fuseki-update', triggeredBy}
    });
  }

  async _onFileDownload(error, file, contents, successIds) {
    let shortId = file.name.replace(/\.json$/, '');
    let id = config.fuseki.rootPrefix.prefix+':'+shortId;
    let longId = config.fuseki.rootPrefix.uri+shortId;
    let type = file.name.replace(/\/.*/, '');
    
    if( error ) {
      // send error metric
      this.logError(id, type, error);
      return;
    }

    // append gcs metadata
    for( let node of contents['@graph'] ) {
      let nid = node['@id'] || '';
      if( nid === id || nid === longId || nid.replace(/.*:/, '') === shortId.replace(/.*\//, '') ) {
        node.gcsMetadata = JSON.stringify(file.metadata);
        break;
      }
    }
    
    contents['@context']['gcsMetadata'] = { 
      '@id': 'http://experts.ucdavis.edu/schema#gcsMetadata' 
    };

    try {
      logger.info('Inserting '+file.name+' into fuseki');
      let resp = await fuseki.updateJsonld(contents);

      if( resp.status < 200 || resp.status > 299 ) {
        this.logError(id, type, {message: `Invalid response code (${resp.status}) from fuseki with message: ${await resp.text()}`})
        return;
      }


      this.logSuccess(id, type);
      successIds.push(id);
    } catch(error) {
      // send error metric
      this.logError(id, type, error);
    }
  }

  logError(id, type, error) {
    metrics.logIndexEvent(
      metrics.DEFINITIONS['es-index-status'].type,
      {status: 'error', type}, 1,
      id, {error}
    )
  }

  logSuccess(id, type) {
    metrics.logIndexEvent(
      metrics.DEFINITIONS['es-index-status'].type,
      {status: 'success', type}, 1,
      id
    )
  }

}

const instance = new GCSIndexerModel();
module.exports = instance;
