const {elasticSearch, config} = require('@ucd-lib/rp-node-utils');

class SubjectTerms {

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

  /**
   * @method broader
   * @description given id of subject term, return all broader terms
   * 
   * @param {String} id id of subject term
   * @param {Array} terms results array
   * 
   * @returns {Array}
   */
  async broader(id, terms=[]) {
    let queryDoc = {
      index: config.elasticSearch.indexAlias,
      type: '_all',
      id: id,
      _source_excludes : config.elasticSearch.fields.exclude.join(',')
    }

    let response = await this.client.get(queryDoc);
    if( response && response._source ) {
      terms.push(response._source);
      let broader = response._source.broader;

      if( broader ) {
        if( !Array.isArray(broader) ) broader = [broader];

        for( let term of broader ) {
          await this.broader(term['@id'], terms);
        }
      }
    }

    return terms;
  }

  /**
   * @method narrower
   * @description given id of subject term, return all narrower terms
   * 
   * @param {String} id id of subject term
   * @param {Array} terms results array
   * 
   * @returns {Array}
   */
  async narrower(id, terms=[]) {
    let queryDoc = {
      index: config.elasticSearch.indexAlias,
      type: '_all',
      id: id,
      _source_excludes : config.elasticSearch.fields.exclude.join(',')
    }

    let response;

    try {
      response = await this.client.get(queryDoc);
    } catch(e) {
      return terms;
    }

    if( response && response._source ) {
      terms.push(response._source);
      let narrower = response._source.narrower;

      if( narrower ) {
        if( !Array.isArray(narrower) ) narrower = [narrower];

        for( let term of narrower ) {
          await this.narrower(term['@id'], terms);
        }
      }
    }

    return terms;
  }

  /**
   * @method random
   * @description return random list of keywords
   * 
   * @param {Number} count
   * 
   * @returns {Array} 
   */
  async random(count=10) {
    let queryDoc = {
      index: config.elasticSearch.indexAlias,
      body : {
        query : {
          function_score: {
            query: { 
              bool : {
                should : [
                  {exists : { field: 'hasResearchArea.@id' }},
                  {exists : { field: 'hasSubjectArea.@id' }}
                ]
              }
            },
            random_score: {
              seed: (Math.random() * 100000)+'',
              field: "_seq_no"
            }
          }
        },
        size : count
      },
      _source_includes : 'hasSubjectArea.@id,hasResearchArea.@id'
    }

    let terms = new Set();
    let results = await this.client.search(queryDoc);

    results.hits.hits.forEach(item => {
      asArray(item._source.hasSubjectArea).forEach(term => {
        terms.add(term['@id']);
      });
      asArray(item._source.hasResearchArea).forEach(term => {
        terms.add(term['@id']);
      });
    });

    let ids = Array.from(terms).splice(0, count);

    results = await this.client.mget({
      index: config.elasticSearch.indexAlias,
      body : {ids}
    });

    return results.docs.map(item => item._source);
  }

}

function asArray(items) {
  if( !items ) return [];
  if( !Array.isArray(items) ) return [items];
  return items;
}


module.exports = new SubjectTerms();