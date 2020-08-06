const {logger, middleware} = require('@ucd-lib/rp-node-utils')
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

// simple logging
app.use(middleware.httpLogging);
app.use(cookieParser());
app.use(bodyParser.json());

/**
 * Register Controllers
 */
app.use('/api', require('./controllers'));

app.listen(3000, () => {
  logger.info('api listening on port: '+3000);
})