const express = require('express');
const {logger, config} = require('@ucd-lib/rp-node-utils');
const bodyParser = require('body-parser');
const app = express();

process.on('unhandledRejection', e => {
  logger.error('About to exit on unhandled exception', e);
  setTimeout(() => process.exit(-1), 25);
});

const gcsIndexer = require('./lib/model');
gcsIndexer.connect();

app.use(bodyParser.json());

app.get('/reindex-all', async (req, res) => {
  try {
    let p = gcsIndexer.reindexAll('api');
    res.json({success: true, message: 'reindex of all gcs started'});
    await p;
  } catch(e) {
    logger.error('reindex all failed', e);
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
    logger.error('reindex failed', e);
  }
}


app.listen(config.google.storage.indexer.port, () => {
  logger.info('GCS Indexer API listening on port', config.google.storage.indexer.port);
});