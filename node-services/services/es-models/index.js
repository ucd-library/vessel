const express = require('express');
const {logger, config} = require('@ucd-lib/rp-node-utils');
const model = require('./model');
const app = express();
const bodyParser = require('body-parser');

app.use(bodyParser.text({ type: '*/*' }))

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
  let database = req.query.database || '';

  try {
    type = decodeURIComponent(type);
    uri = decodeURIComponent(uri);

    if( req.query.templateOnly ) {
      res.set('content-type', 'application/sparql-update');
      res.send(await model.getSparqlQuery(type, uri, req.query.templateOnly));
      return;
    }

    let verbose = req.query.verbose ? true : false;

    let data = await model.getModel(type, uri, {verbose, database});
    res.json(data);
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

app.post(/\/.+/, async (req, res) => {
  let path = req.path.replace(/\/(model\/)?/, '').split('/');
  let type = path.shift();
  let uri = path.join('/');
  let database = req.query.database || '';
  let verbose = true;
  let query = req.body;

  try {
    uri = decodeURIComponent(uri);
    let data = await model.getModel(type, uri, {verbose, query, database});
    res.json(data);
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