const express = require('express');
const {logger, config} = require('@ucd-lib/rp-node-utils');
const app = express();

const indexer = require('./lib/indexer');
indexer.connect();

app.use(require('./controllers'));

app.listen(config.indexer.port, () => {
  logger.info('Indexer API listening on port', config.indexer.port);
});