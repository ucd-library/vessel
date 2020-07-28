const router = require('express').Router();
const model = require('../models/elastic-search');
const onError = require('./utils/error-handler');

/**
 * @swagger
 * components/schemas:
 *   ApiSearchDocument:
 *     description: Application search query
 *     properties:
 *       offset:
 *         type: integer
 *         description: (es from), the first result you want to fetch
 *         default : 0
 *       limit:
 *         type: integer
 *         description: max results to return
 *         default : 10
 */

/**
 * @swagger
 * /search:
 *   post:
 *     description: Application search query
 *     tags: [Elastic Search]
 *     requestBody:
 *       required: true
 *       description: Application search query
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             $ref : '#/components/schemas/ApiSearchDocument'
 * 
 *     produces:
 *       - application/json
 *     responses:
 *       200:
 *         description: Application search result object
 *         schema:
 *           type: object
 */
router.post('/', async (req, res) => {
  if( !req.body ) {
    return res.json({error: true, message: 'no body sent'});
  }

  try {
    res.json(await model.apiSearch(req.body));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

router.get('/', async (req, res) => {
  try {
    var q = JSON.parse(req.query.q || '{}');
    res.json(await model.apiSearch(q));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

  /**
   * @swagger
   * /search/es:
   *   post:
   *     description: Raw elastic search query
   *     tags: [Elastic Search]
   *     requestBody:
   *       required: true
   *       description: Elastic search query document body; https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html#search-search-api-request-body
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   * 
   *     produces:
   *       - application/json
   *     responses:
   *       200:
   *         description: Elastic search result object
   *         schema:
   *           type: object
   */
router.post('/es', async (req, res) => {
  if( !req.body ) {
    return res.json({error: true, message: 'no body sent'});
  }

  try {
    res.json(await model.search(req.body));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

 /**
   * @swagger
   * /search/es:
   *   get:
   *     description: Raw elastic search query
   *     tags: [Elastic Search]
   *     parameter:
   *       - required: true
   *         in: query
   *         name: q
   *         description: Stringified elastic search query document body; https://www.elastic.co/guide/en/elasticsearch/reference/current/search-search.html#search-search-api-request-body
   *         schema:
   *           type: string
   * 
   *     produces:
   *       - application/json
   *     responses:
   *       200:
   *         description: Elastic search result object
   *         schema:
   *           type: object
   */
router.get('/es', async (req, res) => {
  try {
    var q = JSON.parse(req.query.q || '{}');
    res.json(await model.search(q));
  } catch(e) {
    onError(req, res, e, 'Error with search query');
  }
});

module.exports = router;