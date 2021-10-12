const router = require('express').Router();
const model = require('../models/elastic-search');
const errorHandler = require('./utils/error-handler');

/**
 * @swagger
 *
 * /api/indexer/errors:
 *   get:
 *     description: Get all records which did not properly index
 *     tags: [Get Error Record]
 *     responses:
 *       200:
 *         description: Requested records
 *         content:
 *          application/json:
 *            schema:
 *              type: array
 *              description: array of records
 */
router.get('/errors', async (req, res) => {
  let errorSearch = {
    offset : 0,
    limit : 10000,
    sort : [],
    filters : {
      '_indexer.success': {
        type : 'keyword',
        value : false
      }
    },
    facets: {}
  }

  try {
    res.json(await model.apiSearch(errorSearch, {debug: req.params.debug === 'true'}));
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

module.exports = router;