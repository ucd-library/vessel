const {logger, config, fuseki} = require('@ucd-lib/rp-node-utils');
const postProcess = require('../default/post-process');
const path = require('path');
const fs = require('fs');

class EsSparqlModel {

  constructor() {
    this.TYPES = {};
    this.MODELS = {};
    this.TEMPLATES = {};

    this.readModels(path.join(__dirname, '..', 'default', 'queries'));

    if( process.env.MODEL_FOLDER ) {
      this.readModels(process.env.MODEL_FOLDER);
    }
    if( process.env.CUSTOM_POST_PROCESSOR ) {
      logger.info('Using custom model post processor: '+process.env.CUSTOM_POST_PROCESSOR);
      postProcess = require(process.env.CUSTOM_POST_PROCESSOR);
    }
  }

  /**
   * @method readModels
   * @description read in the map.js and *.tpl.rq files that define an
   * elastic search model/record.  All files are expected to be in the same
   * directory
   * 
   * @param {String} dir 
   */
  readModels(dir) {
    logger.info('Loading models from: '+dir);

    const mapPath = path.join(dir, 'map.js');
    if( !fs.existsSync(mapPath) ) {
      throw new Error('Unable to load models, no map.js file exists: '+dir);
    }

    let typeMap = require(mapPath);
    this.MODELS = Object.assign(this.MODELS, typeMap);

    for( let model in typeMap ) {
      if( typeof typeMap[model] === 'string' ) {
        typeMap[model] = [typeMap[model]];
      }

      if( Array.isArray(typeMap[model]) ) {
        typeMap[model] = {
          types : typeMap[model],
          additionalProperties : {}
        }
      }

      typeMap[model].types.forEach(type => this.TYPES[type] = model);

      try {
        this.TEMPLATES[model] = fs.readFileSync(path.join(dir, model+'.tpl.rq'), 'utf-8');
        logger.info(`Loaded es model ${model} for types`, typeMap[model]);

        for( let key in this.MODELS[model].additionalProperties ) {
          let fname = this.MODELS[model].additionalProperties[key];
          this.TEMPLATES[fname] = fs.readFileSync(path.join(dir, fname+'.tpl.rq'), 'utf-8');
          logger.info(`Loaded es model ${model} additional property: ${key}`);
        }

      } catch(e) {
        logger.error(`Unable to load es model ${model} for types`, typeMap[model], e);
      }
    }
  }

  /**
   * @method hasModel
   * @description give a type (es model name or rdf uri) return the 
   * es model name if a model is registered or false.
   * 
   * @param {String} type 
   * 
   * @returns {String|Boolean}
   */
  hasModel(type) {
    if( this.MODELS[type] ) return type;
    return this.TYPES[type] ? this.TYPES[type] : false;
  }

  /**
   * @method getSparqlQuery
   * @description given a type (es model name or rdf uri), subject uri and optional graph
   * uri, return the SPARQL query
   * 
   * @param {String} type es model name or rdf uri
   * @param {String} uri subject uri
   * 
   * @returns {String}
   */
  getSparqlQuery(type, uri) {
    let model = type;
    if( !this.TEMPLATES[model] ) {
      model = this.hasModel(type);
      if( !model ) throw new Error('Unknown model or type: '+type);
    }

    if( uri.startsWith(config.fuseki.rootPrefix.prefix+':') ) {
      uri = uri.replace(config.fuseki.rootPrefix.prefix+':', config.fuseki.rootPrefix.uri);
    } else if( uri.startsWith(config.fuseki.schemaPrefix.prefix+':') ) {
      uri = uri.replace(config.fuseki.schemaPrefix.prefix+':', config.fuseki.schemaPrefix.uri);
    }

    if( uri.match('http(s)?:\/\/') ) {
      uri = '<'+uri+'>';
    }

    return this.TEMPLATES[model]
      .replace(/"{{uri}}"/g, uri);
  }

  /**
   * @method getModel
   * @description get a es model from model name or rdf type uri and a subject uri.  Gets
   * model for all registered graphs and merges.
   * 
   * @param {String} type es model name or rdf uri
   * @param {String} uri subject uri
   * @param {Object} options additional options
   * @param {Boolean} options.verbose include SPARQL queries
   * 
   * @returns {Object}
   */
  async getModel(type, uri, opts={}) {
    let model = this.hasModel(type);
    if( !model ) {
      throw new Error('Unknown model type: '+model);
    }

    let result = {
      type,
      modelType: model,
      uri,
      timestamp : Date.now(),
      database : config.fuseki.database,
      model : {}
    }

    if( opts.verbose ) {
      result.sparql = [this.getSparqlQuery(type, uri)];
    }

    result.model = await this._requestModel(type, uri);

    for( let prop in this.MODELS[model].additionalProperties ) {
      type = this.MODELS[model].additionalProperties[prop];
      if( opts.verbose ) {
        result.sparql = [this.getSparqlQuery(type, uri)];
      }
      let propResult = await this._requestModel(type, uri);
      result.model[prop] = propResult[prop];
    }

    await postProcess.run(result.model, {
      type, 
      modelType: result.modelType,
      uri: result.uri,
      timestamp: result.timestamp 
    }, this);

    return result;
  }

  /**
   * @method _requestModel
   * @description make request for es model
   * 
   * @param {String} type es model name or rdf uri
   * @param {String} uri subject uri
   * 
   * @returns {Object}
   */
  async _requestModel(type, uri) {
    let sparqlQuery = this.getSparqlQuery(type, uri);
    let response = await fuseki.query(sparqlQuery, 'application/ld+json');

    // let t = await response.text();
    // console.log(t);
    // response = JSON.parse(t);
    response = await response.json();

    // TODO: this is wrong
    // uri = uri.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':');
    if( response['@context'] ) {
      for( let prefix in response['@context'] ) {
        let prefixUri = response['@context'][prefix];
        if( uri.startsWith(prefixUri) ) {
          uri = uri.replace(prefixUri, prefix+':');
          break;
        }
      }
    }

    if( !response['@graph'] && response['@id'] ) {
      if( response['@context'] ) delete response['@context'];
      let tmp = {'@graph':[response]};
      response = tmp;
    }

    let model = this._constructModel(response['@graph'] || [], uri);
    return model[uri] || {};
  }

  /**
   * @method _constructModel
   * @description loop through returned sparql response and contruct in JSON-LD
   * like es model object
   * 
   * @param {Array|Object} graph 
   * @param {String} id uri to crawl
   * @param {Object} crawled already crawled uri hash
   * 
   * @return Object
   */
  _constructModel(graph, id, crawled={}) {
    if( crawled[id] ) return graph;
  
    if( Array.isArray(graph) ) {
      let g = {};
      for( let node of graph ) {
        g[node['@id']] = node;
      }
      graph = g;
    }

    // in case we need to access later
    crawled[id] = graph[id];
  
    for( let key in graph[id] ) {
      if( key === '@id' ) continue;
  
      if( Array.isArray(graph[id][key]) ) {
        for( let i = 0; i < graph[id][key].length; i++ ) {
          let subid = graph[id][key][i];
          if( typeof subid === 'object' ) {
            subid = subid['@id'];
          }

          if( crawled[subid] ) {
            graph[id][key][i] = crawled[subid]
            continue;
          }
  
          if( graph[subid] ) {
            this._constructModel(graph, subid, crawled);
            graph[id][key][i] = graph[subid]
          } else {
            graph[id][key][i] = subid
          }
        }
      } else if( graph[graph[id][key]] ) {
        if( !crawled[graph[id][key]] ) {
          this._constructModel(graph, graph[id][key], crawled);
          graph[id][key] = graph[graph[id][key]];
        } else {
          graph[id][key] = crawled[graph[id][key]];
        }
      }
    }
  
    return graph;
  }

}

module.exports = new EsSparqlModel();