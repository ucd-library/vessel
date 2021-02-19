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

app.get(/\/.+/, async (req, res) => {
  let path = req.path.replace(/\/(model\/)?/, '').split('/');
  let type = path.shift();
  let uri = path.join('/');

  try {
    type = decodeURIComponent(type);
    uri = decodeURIComponent(uri);
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