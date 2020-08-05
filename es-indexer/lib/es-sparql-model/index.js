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

  hasModel(type) {
    if( this.MODELS[type] ) return type;
    return this.TYPES[type] ? this.TYPES[type] : false;
  }

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