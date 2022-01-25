const express = require('express');
const {logger, config} = require('@ucd-lib/rp-node-utils');
const app = express();

process.on('unhandledRejection', e => {
  logger.error('About to exit on unhandled exception', e);
  setTimeout(() => process.exit(-1), 25);
});

const indexer = require('./lib/indexer');
indexer.connect();

app.use(require('./controllers'));

app.listen(config.indexer.port, () => {
  logger.info('Indexer API listening on port', config.indexer.port);
});