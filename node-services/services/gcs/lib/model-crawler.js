const {fuseki, config} = require('@ucd-lib/rp-node-utils');
const jsonld = require('jsonld');

class FusekiModelCrawler {

  constructor() {
    this.TYPES = ['grant', 'person', 'work'];
  }

  async delete(id) {
    let p = await this.walk(id);
    
    let q = `DELETE WHERE {
  GRAPH ?g {
    ${p.map(row => '  '+row.join(' ')+' .').join('\n')}
  }
}`;
console.log(q);


    // let resp = await fuseki.update(q, 'data');
    // return resp.text();
    return q;
  }

  async walk(uri, state={}) {
    if( state.crawled ) {
      if( state.crawled.includes(uri) ) return;
      state.crawled.push(uri);
    }
    

    if( !uri.match(/^http(s)?:\/\//) ) {
      uri = uri.replace(/.*:/, config.fuseki.rootPrefix.uri);
    }


    let resp = await fuseki.query(`PREFIX experts: <http://experts.ucdavis.edu/>
    PREFIX ucdrp: <http://experts.ucdavis.edu/schema#>
    
    DESCRIBE <${uri}>`, 'application/ld+json');

    let compacted = await resp.json();

    // don't walk on to known types
    if( Object.keys(state).length > 0 && this.isKnownType(compacted) ) {
      console.log('ignoring: ', uri)
      return;
    }

    // init state
    if( Object.keys(state).length === 0 ) {
      state = {
        count : 0,
        query : [],
        crawled : [uri]
      }
    }

    let [expanded] = await jsonld.expand(compacted);
    // let subjectVar = '?_'+state.count+'_';

    for( let prop in expanded ) {
      if( prop === '@id' ) continue;
      let values = expanded[prop];
      if( !Array.isArray(values) ) values = [values];



      for( let value of values ) {
        if( prop === '@type' ) {
          state.query.push(['<'+uri+'>', '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>', '<'+value+'>']);
          continue;
        }

        if( value['@id'] ) {
          // state.count++;
          state.query.push(['<'+uri+'>', '<'+prop+'>', '<'+value['@id']+'>']);
          await this.walk(value['@id'], state);
        } else if( value['@value'] ) {
          state.count++;
          state.query.push(['<'+uri+'>', '<'+prop+'>', '?_'+state.count+'_']);
        }
      }

    }

    return state.query;

  }

  isKnownType(object)  {
    let types = object['@type'] || [];
    if( !Array.isArray(types) ) types = [types];
    types = types.map(type => this.getShortType(type));

    for( let type of types ) {
      if( this.TYPES.includes(type) ) return true;
    }
    return false;
  }

  getShortType(url) {
    url = new URL(url);

    if( url.hash ) {
      return url.hash.replace(/^#/, '').toLowerCase();
    }

    return url.pathname.split('/').pop().toLowerCase();
  }

}

module.exports = new FusekiModelCrawler();