const citation = require('../../lib/citation');
const {fuseki} = require('@ucd-lib/rp-node-utils');
const fs = require('fs');
const path = require('path');

class Miv {

  constructor() {
    this.QUERIES = {
      PUBLICATIONS : fs.readFileSync(path.resolve(__dirname, 'publications.tpl.rq'), 'utf-8'),
      AUTHOR_PUBS : fs.readFileSync(path.resolve(__dirname, 'author-publications.tpl.rq'), 'utf-8')
    }
  }

  async export(user) {
    if( !user.match(/^experts:/) ) {
      user = 'experts:'+user;
    }

    let q = this.QUERIES.AUTHOR_PUBS.replace(/{{username}}/, user);
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
    }

    return citation.convert(pubs);
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
