const fuseki = require('./fuseki');
const config = require('./config');
const jsonld = require('jsonld');
const path = require('path');

/**
 * @class FusekiModelCrawler
 * @description used to crawl fuseki rdf graph, constructing queries
 * of vessel models.  This is mostly used to construct delete queries
 * and includes a helper function for this purpose.
 */
class FusekiModelCrawler {

  constructor() {
    let typeMap = require(path.join(config.models.rootDir, 'queries', 'map.js'));
    this.TYPES = [];
    
    for( let key in typeMap ) {
      if( Array.isArray(typeMap[key]) ) {
        typeMap[key].forEach(type => this.TYPES.push(type));
      } else if( typeMap[key].types ) {
        typeMap[key].types.forEach(type => this.TYPES.push(type));
      }
    }
  }

  /**
   * @method createDeleteQuery
   * @description wrapper around the walk function to create
   * a delete statement to remove a model from fusseki
   * 
   * @param {String} uri 
   * @returns {Promise<String>}
   */
  async createDeleteQuery(uri) {
    let triples = await this.walk(uri);

    if( !triples ) return;
    if( triples.length === 0 ) return '';
    
    let q = triples.map(row => `DELETE WHERE {
      GRAPH ?g {
        ${row.join(' ')} .
      }
    };`).join('\n');

// JM - this can be really slooow in fuseki :(
//     let q = `DELETE WHERE {
//   GRAPH ?g {
//     ${triples.map(row => '  '+row.join(' ')+' .').join('\n')}
//   }
// }`;

    return q;
  }

  /**
   * @method walk
   * @description walk fuseki graph starting given uri, discoverying 
   * all triples for a uri (model).  The walk function will stop when
   * it hits a known vessel type.  Example, a 'person' uri will walk
   * to all properties of a graph for the person, but would stop when
   * it hits the uri for a persons work. 
   * 
   * When called this function, leave the state object null!
   * 
   * @param {String} uri uri to start crawling at.  should be a known type.
   * @param {Object} state for internal crawling, leave empty when calling
   * @returns {Promise<Array>}
   */
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
    let [expanded] = await jsonld.expand(compacted);

    // this probably means the uri doesn't point at anything
    if( !expanded ) return;

    // don't walk on to known types
    if( Object.keys(state).length > 0 && 
      this.isVesselType(expanded) ) {
      // console.log('ignoring', expanded['@type']);
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

    for( let prop in expanded ) {
      // ignore id
      if( prop === '@id' ) continue;

      // lets just work with arrays only
      let values = expanded[prop];
      if( !Array.isArray(values) ) values = [values];

      for( let value of values ) {
        // the type property is a special case, manually add expanded rdf type
        if( prop === '@type' ) {
          state.query.push(['<'+uri+'>', '<http://www.w3.org/1999/02/22-rdf-syntax-ns#type>', '<'+value+'>']);
          continue;
        }

        // for uri objects we add all uri's, then walk the new uri
        if( value['@id'] ) {
          state.query.push(['<'+uri+'>', '<'+prop+'>', '<'+value['@id']+'>']);
          await this.walk(value['@id'], state);

        // for value objects, we just store a query parameter
        // TODO: perhaps add option to function to store the value instead
        } else if( value['@value'] ) {
          state.count++;
          state.query.push(['<'+uri+'>', '<'+prop+'>', '?_'+state.count+'_']);
        }
      }

    }

    return state.query;
  }

  /**
   * @method isVesselType
   * @description given a type, is this a known vessel type
   * 
   * @param {Object} object jsonld object from DESCRIBE call
   * @returns {Boolean}
   */
  isVesselType(object)  {
    let types = object['@type'] || [];
    if( !Array.isArray(types) ) types = [types];

    for( let type of types ) {
      if( this.TYPES.includes(type) ) return true;
    }
    return false;
  }


}

module.exports = new FusekiModelCrawler();