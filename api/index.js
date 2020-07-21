const {logger} = require('@ucd-lib/rp-node-utils')
const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');

app.use((req, res, next) => {
  res.on('finish',() => {
    logger.info(`${res.statusCode} ${req.method} ${req.protocol}/${req.httpVersion} ${req.originalUrl || req.url} ${req.get('User-Agent') || 'no-user-agent'}`);
  });
  next();
});

app.use(cookieParser());
app.use(bodyParser.json());

/**
 * Register Controllers
 */
app.use('/api', require('./controllers'));

app.listen(3000, () => {
  logger.info('api listening on port: '+3000);
})