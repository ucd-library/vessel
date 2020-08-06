const {fuseki, config, logger} = require('@ucd-lib/rp-node-utils');
const merge = require('deepmerge');
const clean = require('./clean');
// const typeMap = require('./default-queries/map');
const path = require('path');
const fs = require('fs');

class EsSparqlModel {

  constructor() {
    this.GRAPHS = config.fuseki.graphs;

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

      typeMap[model].forEach(type => this.TYPES[type] = model);

      try {
        this.TEMPLATES[model] = fs.readFileSync(path.join(dir, model+'.tpl.rq'), 'utf-8');
        logger.info(`Load es model ${model} for types`, typeMap[model]);
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
   * @param {String} graph graph uri, defaults to sparql variable ?graph
   * 
   * @returns {String}
   */
  getSparqlQuery(type, uri, graph='?graph') {
    let model = this.hasModel(type);
    if( !model ) throw new Error('Unknown model or type: '+type);

    if( !graph.match(/^\?/) ) {
      graph = '<'+graph+'>';
    }

    return this.TEMPLATES[model]
      .replace(/"{{uri}}"/, uri)
      .replace(/"{{graph}}"/, graph);
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
      model : type,
      database : config.fuseki.database,
      graphs : {},
      model : {}
    }

    for( let i = this.GRAPHS.length-1; i >= 0; i-- ) {
      let graph = this.GRAPHS[i];
      let model = await this._getModelForGraph(graph, type, uri);
      result.graphs[graph] = model;
      result.model = merge(result.model, model);
    }

    clean.run(result.model);
    result.model.uri = uri;
    result.model.indexerTimestamp = Date.now();

    return result;
  }

  /**
   * @method _getModelForGraph
   * @description get a es model for a specific graph
   * 
   * @param {String} graph graph uri
   * @param {String} type es model name or rdf uri
   * @param {String} uri subject uri
   * 
   * @returns {Object}
   */
  async _getModelForGraph(graph, type, uri) {
    let sparqlQuery = this.getSparqlQuery(type, uri, graph);
    let response = await fuseki.query(sparqlQuery, 'application/ld+json');
    response = await response.json();

    // TODO: this is wrong
    uri = uri.replace(config.fuseki.rootPrefix.uri, config.fuseki.rootPrefix.prefix+':');
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