const {kafka, redis, fuseki, logger, config, esSparqlModel, Status} = require('@ucd-lib/rp-node-utils');
const {fork} = require('child_process');
const elasticSearch = require('./elastic-search');
const Reindex = require('./reindex');
const path = require('path');
let count = 0;
/**
 * @class Indexer
 * @description main indexer that reads kafka stream, debounces uris, queries fuseki and
 * finally inserts model into elastic search
 */
class Indexer {

  constructor() {
    // this.lastMessageTimer = null;
    this.run = true;

    this.childExecFile = path.resolve(__dirname, 'indexer-exec.js');
    this.kafkaConsumer = new kafka.Consumer({
      'group.id': config.kafka.groups.index,
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
    },{
      // subscribe to front of committed offset
      'auto.offset.reset' : 'earliest'
    });

    this.status = new Status({producer: 'indexer'});
    this.reindex = new Reindex();
  }

  /**
   * @method connect
   * @description connect to redis, kafka and elastic search. Ensure kafka topic.  Query 
   * for kafka watermarks and last commited offset.  Register consumer to last committed 
   * offset and start reading kafka stream.  After a small delay, check to see if any messages 
   * are stashed in redis that were never executed
   */
  async connect() {
    await redis.connect();
    await elasticSearch.connect();

    await this.reindex.connect();

    await this.kafkaConsumer.connect();

    let topics = [config.kafka.topics.index];
    logger.info('waiting for topics: ', topics);
    await this.kafkaConsumer.waitForTopics(topics);
    logger.info('topics ready: ', topics);

    await this.kafkaConsumer.subscribe([config.kafka.topics.index]);

    await this.status.connect();

    this.listen();
  }

  createChildExec() {
    if( this.childProc ) return;
    logger.info('Creating child exec process');

    this.childProc = fork(this.childExecFile);
    this.childProc.on('exit', (code) => {
      this.childProc = null;
      logger.info('Child exec process exited: '+code);
      if( this.childProcIndexResolve ) {
        this.childProcIndexResolve.reject({message: 'exit code: '+code, stack: 'not traceble, check process server logs'});
        this.childProcIndexResolve = null;
      }
    });
    this.childProc.on('error', e => {
      this.childProc = null;
      logger.info('Child exec process error', e);
      if( this.childProcIndexResolve ) {
        this.childProcIndexResolve.reject(e);
        this.childProcIndexResolve = null;
      }
    });
    this.childProc.on('message', e => {
      if( this.childProcIndexResolve ) {
        this.childProcIndexResolve.resolve();
        this.childProcIndexResolve = null;
      }
    });
  }

  /**
   * @method listen
   * @description Start consuming messages from kafka, register onMessage as the handler.
   */
  async listen() {
    try {
      await this.kafkaConsumer.consume(msg => this.onMessage(msg));
    } catch(e) {
      console.error('kafka consume error', e);
    }
  }

  /**
   * @method onMessage
   * @description handle a kafka message.  Messages should subject index requests or index
   * commands. Resets the message handler timeout (the main part of the debouncer).
   * 
   * Subject index request message:
   * {
   *   subject: [uri],
   *   sender: [label] optional,
   *   force: [boolean] optional,
   *   type: [uri] optional
   * }
   * 
   * 
   * @param {Object} msg kafka message
   */
  async onMessage(msg) {
    this.run = false;

    let id = kafka.utils.getMsgId(msg);
    logger.info(`handling kafka message: ${id}`);

    let payload;
    try {
      payload = JSON.parse(msg.value);
      payload.msgId = id;
    } catch(e) {
      logger.error(`failed to parse index payload. message: ${id}`, e.message, msg.value.toString('utf-8'));
      return;
    }

    // unlike the debouncer, lookup subject types 
    // we will only debounce known types
    if( !payload.type || payload.types ) {
      let response = await fuseki.query(`select * { <${payload.subject}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}`)
    
      let body;
      try {
        body = await response.text();
        body = JSON.parse(body);
      } catch(e) {
        logger.error(`From ${payload.msgId} sent by ${payload.sender || 'unknown'}: Fuseki request failed (${response.status}):`, body);
        return;
      }
  
      payload.types = [...new Set(body.results.bindings.map(term => term.type.value))];
    }

    let modelType = await this.getKnownModelType(payload);
    if( !modelType ) {
      this.status.send({
        status: 'ignored', 
        action: 'index', 
        index: await redis.client.get(config.redix.keys.indexWrite),
        subject: payload.subject
      });
      logger.info(`Ignoring message ${payload.msgId} with subject ${payload.subject} sent by ${payload.sender || 'unknown'}: Type has no model ${modelType} ${JSON.stringify(payload.types || [])}`);
      return;
    }

    try {
      payload.index = await redis.client.get(config.redis.keys.indexWrite);

      this.status.send({
        status: this.status.STATES.START, 
        action: 'index',
        index: payload.index,
        subject: payload.subject
      });
      await this.index(payload.subject, payload);

      this.status.send({
        status: this.status.STATES.COMPLETE, 
        action: 'index', 
        index : payload.index,
        subject: payload.subject
      });
    } catch(e) {
      logger.error('index error', e);
      this.status.send({
        status : this.status.STATES.ERROR, 
        subject : payload.subject,
        action: 'index',
        index: payload.index,
        error : {
          id : payload.subject.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':'),
          message : e.message,
          stack : e.stack,
          logs : ['index process died'],
          kafkaMessage : payload
        }
      });
    }
  }

  /**
   * @method getKnownModelType
   * @description see if type provided in message is a known type
   * 
   * @param {Object} msg 
   * 
   * @returns {String|null}
   */
  async getKnownModelType(msg) {
    if( msg.type && (await esSparqlModel.hasModel(msg.type)) ) {
      return msg.type;
    }
    if( msg.types ) {
      for( let type of msg.types ) {
        if( (await esSparqlModel.hasModel(type)) ) return type;
      }
    }

    return null;
  }

  index(key, msg) {
    this.createChildExec();

    this.childProcIndexPromise = new Promise((resolve, reject) => {
      this.childProcIndexResolve = {resolve, reject};
      this.childProc.send({key, msg});
    });

    return this.childProcIndexPromise;
  }

}

module.exports = new Indexer();