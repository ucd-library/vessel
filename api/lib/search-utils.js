const {logger} = require('@ucd-lib/rp-node-utils');

class SearchModelUtils {

  constructor() {
    this.DEFAULT_OFFSET = 0;
    this.DEFAULT_LIMIT = 10;
    this.IGNORE_HIGHLIGHT_FIELDS = ['@type', '_acl', '_indexer'];
  }

  /**
   * @method esResultToApiResult
   * @description given a es result object, return a api
   * result object
   * 
   * @param {Object} esResult 
   * @param {Object} searchDocument 
   */
  esResultToApiResult(esResult, searchDocument = {}) {
    let response = {
      total : 0,
      offset : searchDocument.offset,
      limit : searchDocument.limit,
      results : [],
      aggregations : {
        facets : {},
        ranges : {}
      },
    }

    if( esResult.hits ) {
      response.total = esResult.hits.total;

      // TODO: did the API change?
      if( typeof response.total === 'object' && response.total.value ) {
        response.total = response.total.value;
      }

      if( esResult.hits.hits ) {
        response.results = esResult.hits.hits
          .map(item => {
            item._source._score = item._score;
            item._source._explanation = item._explanation;
            if( item.highlight ) {
              let fields = Object.keys(item.highlight);
              let field;

              for( field of fields ) {
                if( this.IGNORE_HIGHLIGHT_FIELDS.includes(field) ) continue;
                break;
              }
              item._source._snippet = {field, value : item.highlight[field][0]}
            }            
            return item._source;
          });
      }
    }

    if( esResult.aggregations ) {
      for( let facet in esResult.aggregations ) {
        

        // it's a facet filter, just add
        if( esResult.aggregations[facet].buckets ) {
          response.aggregations.facets[facet] = {};
          esResult.aggregations[facet].buckets.forEach(item => {
            response.aggregations.facets[facet][item.key] = item.doc_count;
          });
        } else {
          // check for range filter
          facet = facet.replace(/-(min|max)$/, '');

          // we are going to check
          //  - the type in the ucd api document is of range
          //  - we have the -min and -max keys in the es aggs result
          //  - the es aggs result range has a value (ie ignore null)
          //  - we haven't already added the range (cause you will hit this twice)
          if( !response.aggregations.ranges[facet] &&
              searchDocument.facets[facet] &&
              searchDocument.facets[facet].type === 'range' && 
              esResult.aggregations[facet+'-min'] &&
              esResult.aggregations[facet+'-max'] &&
              esResult.aggregations[facet+'-max'].value ) {

                response.aggregations.ranges[facet] = {
              min : esResult.aggregations[facet+'-min'].value,
              max : esResult.aggregations[facet+'-max'].value,
            };
          }
        }
      }
    }

    return response;
  }

  /**
   * @method searchDocumentToEsBody
   * @description transform ucd api search query to elastic search body
   * 
   * @param {Object} query
   * @param {Object} query.filters query filters
   * @param {String} query.text text search
   * @param {Array} query.textFields fields to include in text search
   * @param {Object} query.facets facet to return with query
   * @param {Object} query.functionScore function_score to use in es query
   * @param {Number} query.offset
   * @param {Number} query.limit
   * @param {Object} query.sort 
   * @param {Boolean} noLimit defaults to false
   */
  searchDocumentToEsBody(query, noLimit=false) {
    let esBody = {
      highlight : {
        order: 'score',
        fields: {
          "*": {}
        }
      },
      from : query.offset !== undefined ? query.offset : 0,
      size : query.limit !== undefined ? query.limit : 10
    }
    if( !query.limit && noLimit === true ) {
      esBody.size = 10000 - esBody.from;
    }

    let aggs = this._getEsAggs(query.facets);
    if( Object.keys(aggs).length ) esBody.aggs = aggs;

    if( query.sort ) {
      esBody.sort = query.sort;
    } else {
      esBody.sort = [
        '_score'
      ]
    }

    if( !query.text && !query.filters ) return esBody;

    esBody.query = {}

    let esBodyQuery = {
      bool : {}
    };

    // add function_score
    if( query.functionScore ) {
      esBody.query.function_score = query.functionScore;
      esBody.query.function_score.query = esBodyQuery;
    } else {
      esBody.query = esBodyQuery;
    }

    // append a text 'multi_match' search
    if( query.text && query.textFields ) {
      esBodyQuery.bool.must = [{
        multi_match : {
          query : query.text,
          type : 'most_fields',
          fields : query.textFields
        }
      }];
    }

    if( !query.filters ) return esBody;

    let range = {};
    let fieldExists = [];
    let rangeWithNull = [];
    let keywords = [];
    let prefix = {};

    // loop all provided filters, splitting into keyword
    // and range filters
    for( var attr in query.filters ) {
      let attrProps = query.filters[attr];
      
      // the attribute is a keyword facet
      if( attrProps.type === 'keyword' ) {

        // or query, simply add terms as array
        if( attrProps.op === 'or' ) {
          keywords.push({
            terms : {
              [attr] : attrProps.value
            }
          });

        // and query, add a new term for each keyword
        } else if( attrProps.op === 'and' ||  attrProps.op === undefined ||  attrProps.op === '' ) {
          if( !Array.isArray(attrProps.value) ) attrProps.value = [attrProps.value];

          attrProps.value.forEach(val => {
            keywords.push({
              term : {
                [attr] : val
              }
            });
          });
        }
      
      // the attribute is a range facet
      } else if( attrProps.type === 'range' ) {

        // we want to include null values in the range filter        
        if( attrProps.value.includeNull ) {
          
          let r = Object.assign({}, attrProps.value);
          let nullValue = r.includeNull;
          delete r.includeNull;

          rangeWithNull.push(this._getRangeWithNullQuery(r, attr));
        } else {
          if( attrProps.value.includeNull !== undefined ) {
            delete attrProps.value.includeNull;
          }
          range[attr] = attrProps.value;
        }
      } else if( attrProps.type === 'prefix' ) {

        prefix[attr] = attrProps.value;

      // the attribute is an exists filter
      } else if( attrProps.type === 'exists') {
      
        fieldExists.push(attr);
      
      } else if ( attrProps.type === 'boolean' ) {
        
        if( !esBody.query.term ) esBody.query.term = {};
        esBody.query.term[attr] = attrProps.value;

      }
    }

    // if we found keyword filters, append the 'filter' attribute
    if( keywords.length > 0 ) {
      esBodyQuery.bool.filter = keywords;
    }

    // if a property must exist, add to exists object using query.bool.should
    if (fieldExists.length > 0)  {
      if (!esBodyQuery.bool.must) esBodyQuery.bool.must = [];
      for (const field of fieldExists) {
        esBodyQuery.bool.must.push({exists: {field}})
      }
    }

    // if we found range filters, append.  This uses query.bool.must
    // just like text search, so check to see if query.bool.must was already
    // created
    if( Object.keys(range).length > 0 ) {
      if( !esBodyQuery.bool.must ) {
        esBodyQuery.bool.must = [];
      }

      esBodyQuery.bool.must.push({range});
    }

    // just like above, range with null uses query.bool.must, so repeat steps
    if( rangeWithNull.length > 0 ) {
      if( !esBodyQuery.bool.must ) {
        esBodyQuery.bool.must = [];
      }

      esBodyQuery.bool.must = esBodyQuery.bool.must.concat(rangeWithNull);
    }

    if( Object.keys(prefix).length > 0 ) {
      if( !esBodyQuery.bool.must ) {
        esBodyQuery.bool.must = [];
      }
      esBodyQuery.bool.must.push({prefix});
    }

    // if( !Object.keys(esBody.query.bool).length ) {
    //   delete esBody.query.bool;
    // }

    return esBody;
  }

  /**
   * @method _getEsAggs
   * @description given a ucd api search document facets object, return
   * a elastic search aggregation object.
   * 
   * @param {Object.<string, {type: string, max: number}>} facets hash of facet key to facet description object
   */
  _getEsAggs(facets = {}) {
    let aggs = {};

    for( var key in facets ) {
      if( facets[key].type === 'facet' ) {
        aggs[key] = {
          terms : { 
            field : key,
            size : facets[key].max || 1000
          }
        }
      } else if( facets[key].type === 'range' ) {
        aggs[key+'-min'] = {
          min : { 
            field : key
          }
        }
        aggs[key+'-max'] = {
          max : { 
            field : key
          }
        }
      }
    }

    return aggs;
  }

  /**
   * @method _getRangeWithNullQuery
   * @description get the part of the es query document for a range
   * value but allowing nulls (so range value is either in range
   * or not present).
   * 
   * @param {Object} rangeQuery 
   * @param {String} attr 
   * 
   * @returns {Object}
   */
  _getRangeWithNullQuery(rangeQuery, attr) {
    return {
      bool : {
        should : [
          {
            range: {
              [attr] : rangeQuery
            }
          },
          {
            bool: {
              must_not: {
                exists: {
                  field: attr
                }
              }
            }
          }
        ]
      }
    }
  }

}

module.exports = new SearchModelUtils();