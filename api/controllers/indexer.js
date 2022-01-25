const router = require('express').Router();
const {middleware, config, fetch} = require('@ucd-lib/rp-node-utils');
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

router.get('/state/:index/:service/:state', async (req, res) => {
  let q = {
    from : req.query.from || 0,
    size : req.query.size || 10
  }

  try {
    res.json(await model.indexerItemsByState(
      req.params.index,
      req.params.service, 
      req.params.state,
      q
    ));
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.get(/\/status\/.*/, async (req, res) => {
  let subject = req.url.replace(/^\/status\//, '');
  try {
    res.json(await model.indexerItem(decodeURIComponent(subject)));
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.get('/reindex', middleware.admin, async (req, res) => {
  let rebuildSchema = req.query['rebuild-schema'] || '';
  let type = req.query.type || '';

  let url = config.gateway.serviceHosts.indexer+'/admin/reindex';
  if( rebuildSchema.trim().toLowerCase() === 'true' ) {
    url += '/rebuild-schema';
  } else {
    url += '/run' + (type ? '/'+type : '');
  }

  try {
    let indexResp = await fetch(url);
    res.json(await indexResp.text());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.get('/set-index/:indexName', middleware.admin, async (req, res) => {
  let url = config.gateway.serviceHosts.indexer+'/admin/set-index/'+req.params.indexName;
  try {
    let indexResp = await fetch(url);
    res.json(await indexResp.text());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.get('/delete-pending', middleware.admin, async (req, res) => {
  let url = config.gateway.serviceHosts.indexer+'/admin/delete-pending';
  try {
    let indexResp = await fetch(url);
    res.json(await indexResp.text());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.post('/analyze', middleware.admin, async (req, res) => {
  let body = req.body;
  if( typeof body === 'object' ) body = JSON.stringify(body);
  let url = config.gateway.serviceHosts.indexer+'/admin/analyze';
  try {
    let indexResp = await fetch(url,{
      method : 'POST',
      headers : {'content-type' : 'application/json'},
      body
    });
    res.json(await indexResp.json());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

module.exports = router;