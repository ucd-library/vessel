const {fuseki, config, logger} = require('@ucd-lib/rp-node-utils');
const clean = require('./clean');
const path = require('path');
const fs = require('fs');

class EsSparqlModel {

  constructor() {
    // this.GRAPHS = config.fuseki.graphs;
    // this.GRAPHS.push('http://experts.ucdavis.edu/oap/');

    this.TYPES = {};
    this.MODELS = {};
    this.TEMPLATES = {};

    this.readModels(path.join(__dirname, 'default-queries'));
    // TODO: add check for global dir or env variable to points to additional model paths
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
   * 
   * @returns {Object}
   */
  async getModel(type, uri) {
    let model = this.hasModel(type);
    if( !model ) {
      throw new Error('Unknown model type: '+model);
    }

    let result = {
      type,
      database : config.fuseki.database,
      model : {}
    }

    result.model = await this._requestModel(type, uri);

    for( let prop in this.MODELS[model].additionalProperties ) {
      type = this.MODELS[model].additionalProperties[prop];
      let propResult = await this._requestModel(type, uri);
      result.model[prop] = propResult[prop];
    }

    clean.run(result.model, {type, modelType: model});
    result.model.uri = uri;
    result.model.indexerTimestamp = Date.now();

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
    crawled[id] = true;
  
    if( Array.isArray(graph) ) {
      let g = {};
      for( let node of graph ) {
        g[node['@id']] = node;
      }
      graph = g;
    }
  
    for( let key in graph[id] ) {
      if( key === '@id' ) continue;
  
      if( Array.isArray(graph[id][key]) ) {
        for( let i = 0; i < graph[id][key].length; i++ ) {
          let subid = graph[id][key][i];
          if( crawled[subid] ) continue;
  
          if( graph[subid] ) {
            this._constructModel(graph, subid, crawled);
            graph[id][key][i] = graph[subid]
          } else {
            graph[id][key][i] = subid
          }
        }
      } else if( graph[graph[id][key]] && !crawled[graph[id][key]] ) {
        this._constructModel(graph, graph[id][key], crawled);
        graph[id][key] = graph[graph[id][key]];
      }
    }
  
    return graph;
  }

}

module.exports = new EsSparqlModel();