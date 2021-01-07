const {elasticSearch, config} = require('@ucd-lib/rp-node-utils');
const utils = require('../lib/search-utils');

class ElasticSearch {

  constructor() {
    this.DEFAULT_OFFSET = 0;
    this.DEFAULT_LIMIT = 10;
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
   * @method get
   * @description get the elasticsearch record using id
   * 
   * @param {String} id record id
   * 
   * @returns {Promise} resolves to elasticsearch result
   */
  get(id) {
    let queryDoc = {
      index: config.elasticSearch.indexAlias,
      type: '_all',
      id: id,
      _source_excludes : config.elasticSearch.fields.exclude.join(',')
    }

    return this.client.get(queryDoc);
  }

  /**
   * @method search
   * @description search the elasticsearch pure es search document
   * 
   * @param {Object} body elasticsearch search body
   * @param {Object} options elasticsearch main object for additional options
   * 
   * @returns {Promise} resolves to elasticsearch result
   */
  search(body = {}, options={}) {
    options.index = config.elasticSearch.indexAlias;
    options.body = body;
    options._source_excludes = config.elasticSearch.fields.exclude.join(',');

    return this.client.search(options);
  }

  /**
   * @method apiSearch
   * @description search the elasticsearch records using the ucd api
   * search document. 
   * 
   * @param {Object} SearchDocument
   * @param {Boolean} options.noLimit no limit on returned search filters.  defaults to false
   * @param {Boolean} options.debug will return searchDocument and esBody in result
   * 
   * @returns {Promise} resolves to search result
   */
  async apiSearch(searchDocument = {}, options = {noLimit: false, debug: false}) {
    if( !searchDocument.filters ) {
      searchDocument.filters = {};
    }

    let esBody = utils.searchDocumentToEsBody(searchDocument, options.noLimit);
    let esResult = await this.search(esBody);
    let result = utils.esResultToApiResult(esResult, searchDocument);

    // now we need to fill on 'or' filters facets options
    // to get counts as the client UI wants them, we need to perform a
    // agg only query with the 'or' bucket attributes removed
    let facets = searchDocument.facets || {};
    for( let filter in searchDocument.filters ) {
      // user don't care about this agg
      if( !facets[filter] ) continue; 
      // only need to worry about facet filters
      if( searchDocument.filters[filter].type !== 'keyword' ) continue; 
      // only need to worry about 'or' filters
      if( searchDocument.filters[filter].op !== 'or' ) continue; 

      let tmpSearchDoc = clone(searchDocument);
      // we don't need results
      tmpSearchDoc.offset = 0;
      tmpSearchDoc.limit = 0;
      // remove the filter
      delete tmpSearchDoc.filters[filter]
      // only ask for aggs on this filter
      tmpSearchDoc.facets = {
        [filter] : {
          type : 'facet'
        }
      }

      let tmpResult = await this.search(this.searchDocumentToEsBody(tmpSearchDoc));
      tmpResult = this.esResultToApiResult(tmpResult, tmpSearchDoc);

      // finally replace facets response
      result.aggregations.facets[filter] = tmpResult.aggregations.facets[filter];
    }

    if( options.debug ) {
      result.searchDocument = searchDocument;
      result.esBody = esBody;
    }

    return result;
  }

}

module.exports = new ElasticSearch();