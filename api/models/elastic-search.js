const {elasticSearch, redis, config} = require('@ucd-lib/rp-node-utils');
const utils = require('../lib/search-utils');
const clone = require('clone');

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
    await redis.connect();
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
  async get(id, opts={}) {
    // try by index id
    try {
      let query = {
        index: config.elasticSearch.indexAlias,
        type: '_all',
        id: id
      };

      if( opts.allFields !== true ) {
        query._source_excludes = config.elasticSearch.fields.exclude
          .filter(item => item !== '_acl')
          .join(',');
      }

      return this.client.get(query);
    } catch(e) {}

    // try by known identifiers
    let result = await this.search({
      query : {
        bool : {
          should : [
            {term : {doi : id}},
            {term: {'hasContactInfo.hasEmail.email': id}},
            {term: {'identifier.value': id}},
            {term: {casId: id}}
          ]
        }
      }
    }, null, opts);

    if( result.hits.hits.length ) {
      return result.hits.hits[0];
    }

    throw new Error('Not found: '+id);
  }

  /**
   * @method search
   * @description search the elasticsearch pure es search document
   * 
   * @param {Object} body elasticsearch search body
   * @param {Object} options elasticsearch main object for additional options
   * @param {Object} opts additional options for controlling search params
   * @param {Array} roles acl roles
   * 
   * @returns {Promise} resolves to elasticsearch result
   */
  search(body = {}, options={}, opts={}, roles=[]) {
    options.index = config.elasticSearch.indexAlias;
    options.body = body;

    if( opts.bypassRoles !== true ) {
      if( config.data && config.data.private && config.data.private.roles && config.data.private.roles.length ) {
        if( !body.query ) body.query = {};
        if( !body.query.bool ) body.query.bool = {};
        if( !body.query.bool.filter ) body.query.bool.filter = [];
        
        body.query.bool.filter.push({
          terms : {
            _acl : roles
          }
        });
      }
    }

    if( opts.allFields !== true ) {
      options._source_excludes = config.elasticSearch.fields.exclude.join(',');
    }

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
  async apiSearch(searchDocument = {}, options = {noLimit: false, debug: false, searchOpts : null}, roles=[]) {
    if( !searchDocument.filters ) {
      searchDocument.filters = {};
    }

    let esBody = utils.searchDocumentToEsBody(searchDocument, options.noLimit);
    let esResult = await this.search(esBody, undefined, options.searchOpts, roles);
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

      let tmpResult = await this.search(utils.searchDocumentToEsBody(tmpSearchDoc), undefined, options.searchOpts, roles);
      tmpResult = utils.esResultToApiResult(tmpResult, tmpSearchDoc);

      // finally replace facets response
      result.aggregations.facets[filter] = tmpResult.aggregations.facets[filter];
    }

    if( options.debug ) {
      result.searchDocument = searchDocument;
      result.esBody = esBody;
    }

    return result;
  }

  async indexerStats() {
    let resp = await this.client.search({
      index : config.elasticSearch.statusIndex,
      body : {
        aggs : {
          index : {
            terms: {field : 'index'}
          }
        },
        from : 0,
        size : 0
      }
    });

    let indexes = resp.aggregations.index.buckets.map(item => item.key);
    let pendingDelete = await redis.client.get(config.redis.keys.indexedPendingDelete);

    let result = {
      // TODO get active index
      searchIndex :  Object.keys(await this.client.indices.getAlias({name: config.elasticSearch.indexAlias}))[0],
      writeIndex : await redis.client.get(config.redis.keys.indexWrite),
      pendingDeleteIndexes : pendingDelete ? JSON.parse(pendingDelete) : [],
      indexes : {}
    }
    for( let index of indexes ) {
      result.indexes[index] = await this.indexerIndexStats(index);
      if( index === result.searchIndex ) {
        result.indexes[index].active = true;
      }
    }

  
    return result;
  }

  async indexerIndexStats(index) {
    let resp = await this.client.search({
      index : config.elasticSearch.statusIndex,
      body : {
        query : {
          bool : {
            filter : {
              term : {index}
            }
          }
        },
        aggs : {
          debouncer : {
            terms: {field : 'debouncer.status'}
          },
          indexer : {
            terms: {field : 'indexer.status'}
          }
        },
        from : 0,
        size : 0
      }
    });

    let debouncer = {};
    let indexer = {};
    resp.aggregations.debouncer.buckets.forEach(item => debouncer[item.key] = item.doc_count);
    resp.aggregations.indexer.buckets.forEach(item => indexer[item.key] = item.doc_count);

    return {
      total : typeof resp.hits.total === 'object' ? resp.hits.total.value : resp.hits.total,
      debouncer, indexer
    };
  }

  async indexerItem(subject) {
    let resp = await this.client.search({
      index : config.elasticSearch.statusIndex,
      body : {
        query : {
          bool : {
            should : [
              {term : {subject : subject}},
              {term : {shortId : subject}}
            ]
          }
        }
      }
    });

    if( !resp.hits.hits ) return {error: true, message: 'unknown subject: '+subject};
    if( !resp.hits.hits.length ) return {error: true, message: 'unknown subject: '+subject};

    return resp.hits.hits.map(item => item._source);
  }

}

module.exports = new ElasticSearch();