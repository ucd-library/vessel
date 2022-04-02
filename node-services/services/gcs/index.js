const express = require('express');
const {logger, config} = require('@ucd-lib/rp-node-utils');
const bodyParser = require('body-parser');
const app = express();

process.on('unhandledRejection', e => {
  logger.error('About to exit on unhandled exception', e);
  setTimeout(() => process.exit(-1), 25);
});

const gcsIndexer = require('./lib/model');
const crawler = require('./lib/model-crawler');
gcsIndexer.connect();

app.use(bodyParser.json());

app.get(/\/reindex-all\/?.*/, async (req, res) => {
  try {
    let type = req.path.replace(/^\/reindex-all\/?/, '');

    let p = gcsIndexer.reindexAll('api', type);
    res.json({success: true, message: 'reindex of all gcs started'});
    await p;
  } catch(e) {
    onError(res, e, 'reindex all failed');
  }
});

app.get('/remove/:id', async (req, res) => {
  try {
    let response = await crawler.delete(req.params.id);
    

    res.json({success: true, id: req.params.id, response});
  } catch(e) {
    onError(res, e, 'reindex failed');
  }
});

app.get('/reindex/:ids', reindex);
app.post('/reindex', reindex);
async function reindex(req, res) {
  let ids = req.params.ids || req.body;
  if( typeof ids === 'string' ) {
    ids = ids.split(',').map(id => id.trim())
  }

  try {
    let p = gcsIndexer.reindexIds(ids, 'api');
    res.json({success: true, message: 'reindex of gcs started', ids});
    await p;
  } catch(e) {
    onError(res, e, 'reindex failed');
  }
}

app.get('/files', async (req, res) => {
  try {
    res.json(await gcsIndexer.getFiles());
  } catch(e) {
    onError(res, e);
  }
});

function onError(res, e, msg) {
  if( msg ) logger.error(msg, e);
  else logger.error(e);
  
  res.status(500).json({
    success : false,
    message : msg || e.message,
    error : {
      message : e.message,
      stack : e.stack
    }
  });
}

app.listen(config.google.storage.indexer.port, () => {
  logger.info('GCS Indexer API listening on port', config.google.storage.indexer.port);
});