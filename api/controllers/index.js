const router = require('express').Router();
const model = require('../models/elastic-search');
const swaggerSpec = require('./swagger/spec.json');
const errorHandler = require('./utils/error-handler');
const {auth, middleware} = require('@ucd-lib/rp-node-utils');
const path = require('path');
const fs = require('fs');

router.get('/', (req, res) => {
  // res.json(swaggerSpec);
  res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'swagger/spec.json'), 'utf-8')));
});

router.use('/search', require('./search'));
router.use('/indexer', require('./indexer'));
router.use('/miv', require('./miv'));
router.use('/concept', require('./concept'));
router.use('/token', require('./token'));

/**
 * @swagger
 *
 * /api/record/{id}:
 *   get:
 *     description: Get research profile record by id
 *     tags: [Get Record]
 *     parameters:
 *       - name: id
 *         description: id of record, comma separate for multiple id response
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Requested record(s)
 *         content:
 *          application/json:
 *            schema:
 *              type: object
 *              description: record or array of records
 */
router.get(/\/record\/.*/, middleware.user, async (req, res) => {
  let isAdmin = false;
  let roles = (req.jwt || {}).roles || [];
  roles.push('public');

  try {
    isAdmin = auth.isAdmin(req.jwt);
  } catch(e) {}

  let opts = {
    allFields : (req.query.allFields === 'true' && isAdmin)
  };
  try {
    let id = req.originalUrl.replace(/\/api\/record\//, '').replace(/\?.*/, '');
    if( id.includes(',') ) {
      let ids = id.split(',');
      let arr = [];

      for( id of ids ) {
        let record = (await model.get(decodeURIComponent(id), opts))._source;
        if( record._acl && !record._acl.some(role => roles.includes(role)) ) {
          continue;
        }
        arr.push(id);
      }
      res.json(arr);
    } else {
      let record = (await model.get(decodeURIComponent(id), opts))._source;
      console.log(record._acl, req.jwt);
      if( record._acl && !record._acl.some(role => roles.includes(role)) ) {
        return res.status(404).json({error: true, message: 'record not found: '+decodeURIComponent(id)});
      }
      res.json(record);
    }
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

/**
 * @swagger
 *
 * /api/resolve/{id}:
 *   get:
 *     description: Get research profile record id any unique id
 *     tags: [Get Record]
 *     parameters:
 *       - name: id
 *         description: id a unique associated with record
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: record id
 *         content:
 *          application/json:
 *            schema:
 *              type: object
 *              description: record or array of records
 */
router.get(/\/resolve\/.*/, async (req, res) => {
  try {
    let id = req.originalUrl.replace(/\/api\/resolve\//, '');
    id = decodeURIComponent(id);
    let result = await model.get(id);
    if( result && result._source && result._source['@id'] ) {
      res.json({success: true, '@id': result._source['@id'], originalId: id});
    } else {
      res.json({error: true, message: 'not found', id});
    }
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

/**
 * We are defining a couple external service endpoints here.
 * There aren't many
 */

 /**
 * @swagger
 *
 * /fuseki:
 *   post:
 *     description: Query Fuseki linked database
 *     tags: [SPARQL Endpoint]
 *     requestBody:
 *       required: true
 *       description: Application search query
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             properties:
 *               query:
 *                 type: string
 *     responses:
 *       200:
 *         description: Sparql result
 *         content:
 *          application/sparql-results+json:
 *            schema:
 *              type: object
 *              description: JSONLD
 */

module.exports = router;