const router = require('express').Router();
const {middleware} = require('@ucd-lib/rp-node-utils');
const model = require('../models/elastic-search');
const onError = require('./utils/error-handler');

/**
 * @swagger
 * components:
 *  schemas:
 *   ApiSearchDocument:
 *     description: Application search query object
 *     properties:
 *       offset:
 *         type: integer
 *         description: (es from), the first result you want to fetch
 *         default : 0
 *       limit:
 *         type: integer
 *         description: max results to return
 *         default : 10
 *       sort:
 *         type: array
 *         description: How to sort results, provide array of elastic search sort object; 
 *            https://www.elastic.co/guide/en/elasticsearch/reference/current/sort-search-results.html
 *         items:
 *           type: object
 *         default: ['_score']
 *       filters:
 *         type: object
 *         $ref: '#/components/schemas/ApiSearchDocument_filters'
 *       text:
 *         type: string
 *         description: text to use in search
 *         default: ''
 *       textFields:
 *         type: array
 *         items:
 *           type: string
 *         description: text indexes to apply 'text' query parameter to
 *       facets:
 *         type: object
 *         oneOf:
 *           - $ref: '#/components/schemas/ApiSearchDocument_facetsFacet'
 *           - $ref: '#/components/schemas/ApiSearchDocument_facetsRange'
 *
 *   ApiSearchDocument_filters:
 *     description: Query filters where key is the property to filter on and value is filter definition
 *     type: object
 *     oneOf:
 *       - $ref: '#/components/schemas/ApiSearchDocument_filtersKeyword'
 *       - $ref: '#/components/schemas/ApiSearchDocument_filtersRange'
 *       - $ref: '#/components/schemas/ApiSearchDocument_filtersPrefix'
 *       - $ref: '#/components/schemas/ApiSearchDocument_filtersExists'
 *     discriminator:
 *       propertyName: type
 *   
 *   ApiSearchDocument_filtersKeyword:
 *     description: Keyword filter where an exact match must be met.
 *     properties:
 *       type:
 *         type : string
 *         enum:
 *           - keyword
 *       op:
 *         description: logic operation.  Should values be 'or' or 'and' matched
 *         type: string
 *         enum:
 *            - and
 *            - or
 *       value:
 *         description: values to match property to
 *         type: array
 *         items:
 *           type: string
 *     required:
 *       - type
 *       - op
 *       - value
 *
 *   ApiSearchDocument_filtersRange:
 *     description: Application search query object filters values parameters
 *     properties:
 *       type:
 *         type : string
 *         enum:
 *           - range
 *       value:
 *         description: range value object
 *         type: object
 *         $ref: '#/components/schemas/ApiSearchDocument_filtersRangeValue'
 *     required:
 *       - type
 *       - value
 * 
 *   ApiSearchDocument_filtersRangeValue:
 *     description: Range filter value query object.  This should be a elastic search range query with one additional 
 *        property 'includeNull'; https://www.elastic.co/guide/en/elasticsearch/reference/current/query-dsl-range-query.html
 *     properties:
 *       includeNull:
 *         description: should null values be returned in results set
 *         type: boolean
 *         default: false
 *     additionalProperties: true
 * 
 *   ApiSearchDocument_filtersPrefix:
 *     description: Prefix search on property
 *     properties:
 *       type:
 *         type : string
 *         enum:
 *           - prefix
 *       value:
 *         description: prefix match value
 *         type: string
 *     required:
 *       - type
 *       - value
 * 
 *   ApiSearchDocument_filtersExists:
 *     description: Filters results so that parameter(s) must exist
 *     properties:
 *       type:
 *         type : string
 *         enum:
 *           - exists
 *     required:
 *       - type
 * 
 *   ApiSearchDocument_facetsFacet:
 *     description: Return a facet as typical keyword match
 *     properties:
 *       type:
 *         type: string
 *         enum:
 *           - facet
 *     required:
 *       - type
 * 
 *   ApiSearchDocument_facetsRange:
 *     description: Return a facet as min/max range values.  used for range filters
 *     properties:
 *       type:
 *         type: string
 *         enum:
 *           - range
 *     required:
 *       - type
 * 
 *   ApiSearchResult:
 *     description: Application search query result object
 *     properties:
 *       total:
 *          type: integer
 *          description: total results for query (excludes limit/offset parameters)
 *       offset:
 *          type: integer
 *          description: offset parameter used for this query
 *       limit:
 *          type: integer
 *          description: limit parameter used for this query
 *       searchDocument:
 *          type: object
 *          description: Query object used
 *          $ref: '#/components/schemas/ApiSearchDocument'
 *       results:
 *          type: array
 *          description: array of record objects
 *          items:
 *            type: object
 *       aggregations:
 *          type: object
 *          $ref: '#/components/schemas/ApiSearchResult_aggregations'
 *
 *   ApiSearchResult_aggregations:
 *     description: returned aggragations from provided facets is query object
 *     properties:
 *       facets:
 *         type: object
 *       ranges:
 *         type: object
 *
 */

/**
 * @swagger
 * /api/search:
 *   post:
 *     description: Application search query
 *     tags: [Search]
 *     parameters:
 *       - required: false
 *         in: query
 *         name: debug
 *         description: include elastic search body in response
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       description: Application search query
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             $ref : '#/components/schemas/ApiSearchDocument'
 * 
 *     responses:
 *       200:
 *         description: Api search result object
 *         content:
 *           application/json:
 *              schema:
 *                type: object
 *                $ref : '#/components/schemas/ApiSearchResult'
 */
router.post('/',  middleware.user, async (req, res) => {
  if( !req.body ) {
    return res.json({error: true, message: 'no body sent'});
  }

  let roles = getRoles(req);

  try {
    let opts = {
      debug: req.query.debug === 'true',
      searchOpts : {
        explain: req.query.explain === 'true'
      }
    };
    res.json(await model.apiSearch(req.body, opts, roles));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

/**
 * @swagger
 * /api/search:
 *   get:
 *     description: Raw elastic search query
 *     tags: [Search]
 *     parameters:
 *       - required: true
 *         in: query
 *         name: q
 *         description: Stringified ApiSearchDocument Object
 *         schema:
 *           type: string
 *       - required: false
 *         in: query
 *         name: debug
 *         description: include elastic search body in response
 *         schema:
 *           type: string
 * 
 *     responses:
 *       200:
 *         description: Api search result object
 *         content:
 *           application/json:
 *              schema:
 *                type: object
 *                $ref : '#/components/schemas/ApiSearchResult'
 */
router.get('/',  middleware.user, async (req, res) => {
  let roles = getRoles(req);

  try {
    let opts = {
      debug: req.query.debug === 'true',
      searchOpts : {
        explain: req.query.explain === 'true'
      }
    };
    let q = JSON.parse(req.query.q || '{}');
    res.json(await model.apiSearch(q, opts, roles));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

/**
 * @swagger
 * /api/search/es:
 *   post:
 *     description: Application search query
 *     tags: [Search]
 *     requestBody:
 *       required: true
 *       description: Application search query
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             $ref : '#/components/schemas/ApiSearchDocument'
 * 
 *     responses:
 *       200:
 *         description: ElasticSearch search result object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.post('/es', middleware.user, async (req, res) => {
  if( !req.body ) {
    return res.json({error: true, message: 'no body sent'});
  }

  let roles = getRoles(req);

  try {
    res.json(await model.search(req.body, roles));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

/**
 * @swagger
 * /api/search/es:
 *   get:
 *     description: Raw elastic search query
 *     tags: [Search]
 *     parameters:
 *       - required: true
 *         in: query
 *         name: q
 *         description: Stringified elastic search query document body; https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html#search-search-api-request-body
 *         schema:
 *           type: string
 * 
 *     responses:
 *       200:
 *         description: ElasticSearch search result object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 */
router.get('/es', middleware.user, async (req, res) => {
  let roles = getRoles(req);

  try {
    var q = JSON.parse(req.query.q || '{}');
    res.json(await model.search(q, roles));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

function getRoles(req) {
  let roles = (req.jwt || {}).roles || [];
  roles.push('public');
  return roles;
}

module.exports = router;