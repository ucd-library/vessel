const router = require('express').Router();
const reindex = require('../lib/indexer').reindex;
const errorHandler = require('./error-handler');
const {fetch, config, elasticSearch} = require('@ucd-lib/rp-node-utils');

router.get('/set-index-alias/:aliasName', async (req, res) => {
  try {
    let response = await reindex.setIndex(req.params.aliasName);
    res.json(response);
  } catch(e) {
    errorHandler(req, res, e);
  }
});

router.get('/delete-index/:indexName', async (req, res) => {
  try {
    let response = await reindex.deleteIndex(req.params.indexName);
    res.json(response);
  } catch(e) {
    errorHandler(req, res, e);
  }
});

router.get('/reindex', async (req, res) => {
  let flags = {};

  (req.query.flags || '')
    .split(',')
    .array.forEach(item => flags[item] = true);
  
  try {
    res.json(await reindex.reindex(flag));
  } catch(e) {
    errorHandler(req, res, e);
  }
});


router.post('/analyze', async (req, res) => {
  let body = req.body;
  if( typeof body === 'object' ) {
    body = JSON.stringify(body);
  }

  let response = await fetch(
    `http://${config.elasticSearch.username}:${config.elasticSearch.password}@${config.elasticSearch.host}:${config.elasticSearch.port}/${config.elasticSearch.indexAlias}/_analyze`,
    {
      method : 'POST',
      headers : {'content-type': 'application/json'},
      body
    }
  );
  res.json(await response.json());
});

/**
 * Get a list of current elastic search indexes
 */
router.get('/getCurrentIndexes/:id?', async (req, res) => {
  try {
    res.json(await elasticSearch.getCurrentIndexes(req.params.id));
  } catch(e) {
    errorHandler(req, res, e);
  }
});


module.exports = router;