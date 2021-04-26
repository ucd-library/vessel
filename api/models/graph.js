const {elasticSearch, config, esSparqlModel} = require('@ucd-lib/rp-node-utils');

class Graph {

  constructor() {
    this.connect();
  }

  /**
   * @method connect
   * @description setup elastic search connection using the main elastic search library
   * and set client for this elastic search wrapper model.
   * 
   * @returns {Promise}
   */
  async connect() {
    await elasticSearch.connect();
    this.client = elasticSearch.client;
  }

  get(type, id, depth=1) {
    
  }


  /**
   * @method load
   * @description return graph
   * 
   * @param {Object} filter
   * 
   * @returns {Array}
   */
     async load(filter) {
      let queryDoc = {
        index: config.elasticSearch.indexAlias,
        body : {
          query : {
            bool : {
              filter : [
                {term : {'@type' : 'experts:person'}}
              ],
              must : {
                exists: {
                  field: '_.allResearchArea'
                },
              }
            }
          },
          size : 10000
        },
        _source_includes : [
            '@id','@type',
            '_.allResearchArea',
            'hasContactInfo.familyName', 
            'hasContactInfo.givenName'
          ].join(',')
      }

      let result = await this.client.search(queryDoc);
      result = result.hits.hits.map(item => item._source);    
  
      let subjects = new Set();
      for( let person of result ) {
        if( !Array.isArray(person._.allResearchArea) ) {
          person._.allResearchArea = [person._.allResearchArea];
        }
        person.researchArea = person._.allResearchArea;
        delete person._;

        person.researchArea.forEach(item => subjects.add(item))
        person.hasContactInfo = person.hasContactInfo[0];
      }

      subjects = await this.client.mget({
        index: config.elasticSearch.indexAlias,
        body: {
          ids : Array.from(subjects)
        },
        _source_includes : ['@id','@type','label', 'prefLabel'].join(',')
      });

      result = [...result, ...subjects.docs.map(item => item._source)];

      return result;
    }

}

module.exports = new Graph();