const client = require('../lib/elastic-search-client');

class ElasticSearch {

  constructor() {
    this.client = client;
    this.DEFAULT_OFFSET = 0;
    this.DEFAULT_LIMIT = 10;
    this.alias = 'research-profiles';
  }

  /**
   * @method get
   * @description get the elasticsearch record using id
   * 
   * @param {String} id record id
   * 
   * @returns {Promise} resolves to elasticsearch result
   */
  get(id, debug=false) {
    let queryDoc = {
      index: this.alias,
      type: '_all',
      id: id
    }

    // if( !debug ) {
    //   queryDoc._source_exclude = config.elasticsearch.fields.exclude;
    // }

    return this.client.get(queryDoc);
  }

}

module.exports = new ElasticSearch();