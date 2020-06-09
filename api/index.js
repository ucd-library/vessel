const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const compression = require('compression');

app.use((req, res, next) => {
  res.on('finish',() => {
    console.log(`${res.statusCode} ${req.method} ${req.protocol}/${req.httpVersion} ${req.originalUrl || req.url} ${req.get('User-Agent') || 'no-user-agent'}`);
  });
  next();
});

app.use(compression());
app.use(bodyParser.json());

/**
 * Register Controllers
 */
app.use('/api', require('./controllers'));

app.listen(3000, () => {
  console.log('api listening on port: '+3000);
})