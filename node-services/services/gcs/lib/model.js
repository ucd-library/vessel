const {kafka, fuseki, logger, config, metrics} = require('@ucd-lib/rp-node-utils');
const gcs = require('./gcs');
const path = require('path');

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

    this.listen();
  }

  async reindexAll() {
    logger.info('Starting reindex of ALL gcs data, bucket='+config.google.storage.bucket);

    let files = [];
    for( let type of config.google.storage.types ) {
      files = [...files, ...(await gcs.getTypeFiles(type))];
    }

    await this.harvest(files);
  }

  /**
   * @method harvest
   * @description harvest gcs .json files into fuseki.  Method should be 
   * provided array of aggie experts ids (w/ or w/o prefix, it will be striped).
   * GCS bucket should have the format [type]/[id].json.  Type flag is informational
   * and should be one of: api, user, gc-pubsub 
   * 
   * @param {Array} ids Aggie Expert ids to harvest or gcs file objects
   * @param {String} triggeredBy should be one of: api, user, gc-pubsub 
   */
  async harvest(ids, triggeredBy='not set') {
    if( !Array.isArray(ids) ) ids = [ids];

    logger.info('Starting harvest of '+ids.length+' id(s)');
    
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
    let id = config.fuseki.rootPrefix.prefix+':'+file.name.replace(/\.json$/, '');
    let type = file.name.replace(/\/.*/, '');

    if( error ) {
      // send error metric
      this.logError(id, type, error);
      return;
    }

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
      metrics.DEFINITIONS['fuseki-index-status'].type,
      {status: 'error', type}, 1,
      id, {error}
    )
  }

  logSuccess(id, type) {
    metrics.logIndexEvent(
      metrics.DEFINITIONS['fuseki-index-status'].type,
      {status: 'success', type}, 1,
      id
    )
  }

  // listen to pub/sub update message for bucket
  listen() {

  }

}

const instance = new GCSIndexerModel();

(async function() {
  await instance.connect();
  await instance.reindexAll();
})();
