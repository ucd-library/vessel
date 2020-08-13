const router = require('express').Router();
const reindex = require('../lib/reindex');
const es = require('../lib/elastic-search');
const errorHandler = require('./error-handler');

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
    if( reindex.getState().state === reindex.STATES.RUNNING ) {
      return res.json({state: 'Already running'});
    }

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
    if( reindex.getState().state === reindex.STATES.RUNNING ) {
      return res.json({state: 'Already running'});
    }

    reindex.run({updateSchema: true});
    res.json(reindex.getState());
  } catch(e) {
    errorHandler(req, res, e);
  }
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