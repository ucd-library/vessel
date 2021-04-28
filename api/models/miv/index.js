const citation = require('../../lib/citation');
const {fuseki, config} = require('@ucd-lib/rp-node-utils');
const fs = require('fs');
const path = require('path');

class Miv {

  constructor() {
    this.QUERIES = {
      PUBLICATIONS : fs.readFileSync(path.resolve(__dirname, 'publications.tpl.rq'), 'utf-8'),
      AUTHOR_PUBS : fs.readFileSync(path.resolve(__dirname, 'author-publications.tpl.rq'), 'utf-8')
    }
  }

  async export(uri, callback) {
    if( uri.startsWith(config.fuseki.rootPrefix.prefix+':') ) {
      uri = uri.replace(config.fuseki.rootPrefix.prefix+':', config.fuseki.rootPrefix.uri);
    } else if( uri.startsWith(config.fuseki.schemaPrefix.prefix+':') ) {
      uri = uri.replace(config.fuseki.schemaPrefix.prefix+':', config.fuseki.schemaPrefix.uri);
    }

    let q = this.QUERIES.AUTHOR_PUBS.replace(/{{username}}/, '<'+uri+'>');

    let resp = await fuseki.query(q);
    let pubs = await resp.json();

    pubs = pubs.results.bindings.map(r => r.publication.value);
    for( let i = 0; i < pubs.length; i++ ) {
      let q = this.QUERIES.PUBLICATIONS.replace(/{{publication}}/, pubs[i]);

      let resp = await fuseki.query(q, 'application/ld+json');
      let graph = await resp.json();

      graph = graph['@graph'] ? graph['@graph'] : graph;
      pubs[i] = this.formatAuthors(this.getPub(graph), graph);
      // if( i === 5 ) break;

      // TODO: test
      if( typeof pubs[i].issued === 'string' ) {
        pubs[i].issued = {'date-parts': [
          pubs[i].issued.split('-').map(i => parseInt(i))
        ]}
      }

      callback(citation.convert([pubs[i]]));
    }
  }

  getPub(graph) {
    if( !Array.isArray(graph) ) return graph;

    return graph.find(
      item => Array.isArray(item['@type']) ?
        item['@type'].includes('bibo:AcademicArticle') :
        item['@type'] === 'bibo:AcademicArticle'
      );
  }

  formatAuthors(pub, graph) {
    if( !pub.author ) pub.author = [];
    if( !Array.isArray(pub.author) ) pub.author = [pub.author];

    pub.author = pub.author.map(id => this.getAuthor(id, graph));
    pub.author.sort((a, b) => a['cite:rank'] < b['cite:rank'] ? -1 : 1);
    return pub;
  }

  getAuthor(id, graph) {
    return graph.find(item => item['@id'] === id) || id;
  }

}

module.exports = new Miv();
