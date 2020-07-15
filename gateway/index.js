const {logger, config} = require('@ucd-lib/rp-node-utils')
const express = require('express');
const app = express();
const compression = require('compression');
const httpProxy = require('http-proxy');

const proxy = httpProxy.createProxyServer({});
proxy.on('error', err => console.log('Gateway proxy error:', err));

app.use((req, res, next) => {
  res.on('finish',() => {
    logger.info(`${res.statusCode} ${req.method} ${req.protocol}/${req.httpVersion} ${req.originalUrl || req.url} ${req.get('User-Agent') || 'no-user-agent'}`);
  });
  next();
});

app.use(compression());

/**
 * Register Proxies
 */
app.use(/\/api\/.*/, (req, res) => {
  proxy.web(req, res, {target: config.gateway.serviceHosts.api});
});

app.use(/\/auth\/.*/, (req, res) => {
  proxy.web(req, res, {target: config.gateway.serviceHosts.auth});
});

app.use(/\/fuseki\/.*/, (req, res) => {
  proxy.web(req, res, {target: 'http://'+config.fuseki.host+':'+config.fuseki.port+'/'+config.fuseki.database+'/query'});
});

// send all other requests to client
app.use(/.*/, (req, res) => {
  proxy.web(req, res, {target: config.gateway.serviceHosts.client});
});

app.listen(config.gateway.GATEWAY_PORT, () => {
  logger.info('gateway listening on port: '+config.gateway.GATEWAY_PORT);
})