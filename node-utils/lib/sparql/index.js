const fuseki = require('../fuseki');
const merge = require('deepmerge');
const config = require('../config');
const clean = require('./clean');
const typeMap = require('./queries/map');
const path = require('path');
const fs = require('fs');
// const SparqlParser = require('sparqljs').Parser;
// const parser = new SparqlParser();

class SparqlModel {

  constructor() {
    this.GRAPHS = config.fuseki.graphs;

    this.TYPES = {};
    this.MODELS = typeMap;
    this.TEMPLATES = {};

    for( let model in typeMap ) {
      let types = typeMap[model];
      if( typeof typeMap[model] === 'string' ) {
        typeMap[model] = [typeMap[model]];
      }

      typeMap[model].forEach(type => this.TYPES[type] = model);

      this.TEMPLATES[model] = fs.readFileSync(path.join(__dirname, 'queries', model+'.tpl.rq'), 'utf-8');
    }
  }

  hasModel(type) {
    if( this.MODELS[type] ) return true;
    return this.TYPES[type] ? true : false;
  }

  getSparqlQuery(type, uri, graph='?graph') {
    let model = type;
    if( !this.MODELS[type] ) {
      model = this.TYPES[type];
    }
    if( !model ) throw new Error('Unknown model or type: '+type);

    if( !graph.match(/^\?/) ) {
      graph = '<'+graph+'>';
    }

    return this.TEMPLATES[model]
      .replace(/"{{uri}}"/, uri)
      .replace(/"{{graph}}"/, graph);
  }

  async getModel(type, uri) {
    if( !this.TYPES[type] ) {
      throw new Error('Unknown model type: '+type);
    }

    let result = {
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
    return result;
  }

  async _getModelForGraph(graph, type, uri) {
    let sparqlQuery = this.getSparqlQuery(type, uri, graph);
    // console.log(sparqlQuery);
    let response = await fuseki.query(sparqlQuery, 'application/ld+json');
    response = await response.json();

    // TODO: this is wrong
    uri = uri.replace('http://experts.library.ucdavis.edu/individual/', 'ucdrp:');
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

module.exports = new SparqlModel();