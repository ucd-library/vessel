const router = require('express').Router();
const reindex = require('../lib/reindex');
const es = require('../lib/elastic-search');
const errorHandler = require('./error-handler');


router.get('/reindex', async (req, res) => {
  try {
    res.json(reindex.getState());
  } catch(e) {
    errorHandler(req, res, e);
  }
});

router.get('/reindex/run/:type?', async (req, res) => {
  try {
    if( reindex.getState().state === reindex.STATES.RUNNING ) {
      return res.json({state: 'Already running'});
    }

    reindex.run({type: req.params.type});
    res.json(reindex.getState());
  } catch(e) {
    errorHandler(req, res, e);
  }
});

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

router.get('/getCurrentIndexes/:id?', async (req, res) => {
  try {
    res.json(await es.getCurrentIndexes(req.params.id));
  } catch(e) {
    errorHandler(req, res, e);
  }
});


module.exports = router;