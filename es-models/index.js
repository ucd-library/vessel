const express = require('express');
const {logger, config} = require('@ucd-lib/rp-node-utils');
const model = require('./model');
const app = express();

app.get('/', (req, res) => {
  res.json({
    types : model.TYPES,
    models : model.MODELS
  });
});

app.get('/:type/:uri', async (req, res) => {
  try {
    let type = decodeURIComponent(req.params.type);
    let uri = decodeURIComponent(req.params.uri);
    let verbose = req.query.verbose ? true : false;

    res.json(await model.getModel(type, uri, {verbose}));
  } catch(e) {
    res.status(500).json({
      error : {
        message : e.message,
        stack : e.stack
      },
      description : 'Failed to generate model'
    });
  }
});


app.listen(config.indexer.port, () => {
  logger.info('Model service API listening on port', config.models.port);
});