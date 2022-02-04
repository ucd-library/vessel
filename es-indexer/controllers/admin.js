const router = require('express').Router();
const reindex = require('../lib/indexer').reindex;
const es = require('../lib/elastic-search');
const errorHandler = require('./error-handler');
const {fetch, config} = require('@ucd-lib/rp-node-utils');

/**
 * Get current reindex state
 */
router.get('/reindex', async (req, res) => {
  try {
    res.json(reindex.getState());
  } catch(e) {
    errorHandler(req, res, e);
  }
});

/**
 * Run the reindexer
 */
router.get('/reindex/run/:type?', async (req, res) => {
  try {
    reindex.run({
      type: req.params.type,
      updateSchema : req.query['rebuild-schema'] === 'true' ? true : false
    });
    res.json(reindex.getState());
  } catch(e) {
    errorHandler(req, res, e);
  }
});

/**
 * Completely rebuild the elastic search schema and index
 */
router.get('/reindex/rebuild-schema', async (req, res) => {
  try {
    reindex.run({updateSchema: true});
    res.json(reindex.getState());
  } catch(e) {
    errorHandler(req, res, e);
  }
});

router.get('/set-index/:indexName', async (req, res) => {
  try {
    let response = await reindex.setIndex(req.params.indexName);
    res.json(response);
  } catch(e) {
    errorHandler(req, res, e);
  }
});

router.get('/deletePending', async (req, res) => {
  try {
    reindex.run({updateSchema: true});
    res.json(reindex.getState());
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
    res.json(await es.getCurrentIndexes(req.params.id));
  } catch(e) {
    errorHandler(req, res, e);
  }
});


module.exports = router;