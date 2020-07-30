const router = require('express').Router();
const model = require('../models/elastic-search');
const swaggerSpec = require('./swagger/spec.json');
const errorHandler = require('./utils/error-handler');
const {middleware} = require('@ucd-lib/rp-node-utils');
const path = require('path');
const fs = require('fs');

router.get('/', (req, res) => {
  // res.json(swaggerSpec);
  res.json(JSON.parse(fs.readFileSync(path.join(__dirname, 'swagger/spec.json'), 'utf-8')));
});

router.use('/search', require('./search'));

/**
 * @swagger
 *
 * /api/{id}:
 *   get:
 *     description: Get research profile record by id
 *     tags: [Get Record]
 *     parameters:
 *       - name: id
 *         description: id of record
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Requested record
 *         content:
 *          application/json:
 *            schema:
 *              type: object
 *              description: record
 */
router.get('/:id', async (req, res) => {
  try {
    res.json((await model.get(req.params.id))._source);
  } catch(e) {
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