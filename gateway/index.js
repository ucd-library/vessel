const {logger, config, auth} = require('@ucd-lib/rp-node-utils')
const express = require('express');
const app = express();
const compression = require('compression');
const httpProxy = require('http-proxy');
const cookieParser = require('cookie-parser');
const cors = require('cors')({
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  exposedHeaders : ['content-type', 'link', 'content-disposition', 'content-length', 'pragma', 'expires', 'cache-control'],
  allowedHeaders : ['authorization', 'range', 'cookie', 'content-type', 'prefer', 'slug', 'cache-control', 'accept'],
  credentials: true
});

// cors wrapper control
function enableCors(req, res, next) {
  // set cors
  let enable = false;
  if( req.originalUrl.match(/^\/api(\/.*|$)/) && !req.originalUrl.match(/^\/api\/admin.*/) ) {
    enable = true;
  }

  if( enable ) cors(req, res, next);
  else next();
}

const proxy = httpProxy.createProxyServer({
  xfwd: true,
  selfHandleResponse: true
});
proxy.on('error', err => logger.error('Gateway proxy error:', err));
proxy.on('proxyRes', async (proxyRes, req, res) => {
  if( req.originalUrl.match(/^\/auth\/.*/) && proxyRes.headers['x-vessel-authorized-agent'] ) {
    await auth.handleLogin(res, proxyRes.headers['x-vessel-authorized-agent']);
  } else if( req.originalUrl.match(/^\/auth\/logout/) ) {
    console.log('here');
    auth.handleLogout(req, res);
    res.redirect('/');
    return;
  }

  for( let key in proxyRes.headers ) {
    res.setHeader(key, proxyRes.headers[key]);
  }
  res.status(proxyRes.statusCode);
  proxyRes.pipe(res);
});

/**
 * HTTP Logging
 */
app.use((req, res, next) => {
  res.on('finish',() => {
    logger.info(`${res.statusCode} ${req.method} ${req.protocol}/${req.httpVersion} ${req.originalUrl || req.url} ${req.get('User-Agent') || 'no-user-agent'}`);
  });
  next();
});

app.use(compression());
app.use(cookieParser());

/**
 * Ensure a server secret is set
 */
auth.ensureSecret();

/**
 * To allow unauthenticated request, PRIVATE_SERVER must be set to false.
 * Default is true. /auth/* will always be allowed.
 */
app.use(enableCors);
app.use(require('./controllers/middleware/private-instance'));

/**
 * Register Proxies
 */
app.use(/^\/api(\/.*|$)/, (req, res) => {
  proxy.web(req, res, {
    target: config.gateway.serviceHosts.api+req.originalUrl,
    ignorePath: true
  });
});

app.use(/^\/indexer\/model\/.*/, (req, res) => {
  proxy.web(req, res, {
    target: config.gateway.serviceHosts.indexer+req.originalUrl.replace(/^\/indexer/, ''),
    ignorePath: true
  });
});

app.use(/^\/auth(\/.*|$)/, (req, res) => {
  proxy.web(req, res, {
    target: config.gateway.serviceHosts.auth+req.originalUrl,
    ignorePath: true
  });
});

app.use(/^\/fuseki(\/.*|$)/, (req, res) => {
  proxy.web(req, res, {
    target: 'http://'+config.fuseki.host+':'+config.fuseki.port+'/'+config.fuseki.database+'/query',
    ignorePath: true
  });
});

// send all other requests to client
app.use(/.*/, (req, res) => {
  proxy.web(req, res, {
    target: config.gateway.serviceHosts.client+req.originalUrl,
    ignorePath: true
  });
});

/**
 * Start Server
 */
app.listen(config.gateway.port, () => {
  logger.info('gateway listening on port: '+config.gateway.port);
})
