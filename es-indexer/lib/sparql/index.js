
const publication = require('./publication')
const fuseki = require('../fuseki');
const merge = require('deepmerge');

class SparqlModel {

  constructor() {
    // order matters.  Top graphs take precident
    this.GRAPHS = [
      'https://experts.library.ucdavis.edu/individual',
      'http://iam.ucdavis.edu/ns'
    ]

    this.TYPES = {
      'http://purl.org/ontology/bibo/AcademicArticle' : publication
    }
  }

  hasModel(type) {
    return this.TYPES[type] ? true : false;
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

    return result;
  }

  async _getModelForGraph(graph, type, uri) {
    let sparqlQuery = this.TYPES[type](uri, '<'+graph+'>');
    console.log(graph, type, uri);
    let response = await fuseki.query(sparqlQuery, 'application/ld+json');
    response = await response.json();

    uri = uri.replace('http://experts.library.ucdavis.edu/individual/', 'ucdrp:');
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
  
          if( graph[subid] ) {
            this._constructModel(graph, subid, crawled);
            graph[id][key][i] = graph[subid]
          } else {
            graph[id][key][i] = subid
          }
        }
      } else if( graph[graph[id][key]] ) {
        this._constructModel(graph, graph[id][key], crawled);
        graph[id][key] = graph[graph[id][key]];
      }
    }
  
    return graph;
  }

}

module.exports = new SparqlModel();