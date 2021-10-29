const router = require('express').Router();
const {middleware} = require('@ucd-lib/rp-node-utils');
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

// router.get('/stats', middleware.admin, async (req, res) => {
router.get('/stats', async (req, res) => {
  try {
    res.json(await model.indexerStats());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.get(/\/.*/, async (req, res) => {
  let subject = req.url.replace(/^\/stats\//, '');
  try {
    res.json(await model.indexerItem(decodeURIComponent(subject)));
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});


module.exports = router;