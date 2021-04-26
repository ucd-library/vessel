const router = require('express').Router();
const model = require('../models/graph');
const elasticSearch = require('../models/elastic-search');
const onError = require('./utils/error-handler');
const {auth} = require('@ucd-lib/rp-node-utils');


router.get('/', async (req, res) => {
  try {
    res.json(await model.get())
  } catch(e) {
    onError(req, res, e, 'Failed to generate graph');
  }
});

module.exports = router;