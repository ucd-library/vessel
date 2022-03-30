const router = require('express').Router();
const {middleware, config, fetch} = require('@ucd-lib/rp-node-utils');
const model = require('../models/elastic-search');
const errorHandler = require('./utils/error-handler');

router.get('/reindex', middleware.admin, async (req, res) => {
  let url = new URL(config.gateway.serviceHosts.indexer+'/admin/reindex/'+req.params.indexName);
  if( req.query.flags ) url.searchParams.append('flags', req.query.flags);

  try {
    let indexResp = await fetch(url.href);
    res.json(await indexResp.text());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

router.get('/stats', middleware.admin, async (req, res) => {
  try {
    res.json(await model.indexerStats());
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

router.get('/schema/:name', middleware.admin, async (req, res) => {
  let body = req.body;
  if( typeof body === 'object' ) body = JSON.stringify(body);
  let url = 'http://'+config.elasticSearch.host+':'+config.elasticSearch.port+'/'+req.params.name;
  try {
    let indexResp = await fetch(url);
    res.json(await indexResp.json());
  } catch(e) {
    console.log(e);
    errorHandler(req, res, e);
  }
});

module.exports = router;