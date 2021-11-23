const {logger, config, auth, middleware} = require('@ucd-lib/rp-node-utils');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const compression = require('compression');
const httpProxy = require('http-proxy');
const cookieParser = require('cookie-parser');
const cors = require('cors')({
  origin: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  exposedHeaders : ['content-type', 'link', 'content-disposition', 'content-length', 'pragma', 'expires', 'cache-control'],
  allowedHeaders : ['authorization', 'range', 'cookie', 'content-type', 'prefer', 'slug', 'cache-control', 'accept'],
  credentials: true
});

// cors wrapper control
function enableCors(req, res, next) {
  
  // set cors for /api requests
  let enable = false;
  if( req.originalUrl.match(/^\/api(\/.*|$)/) && !req.originalUrl.match(/^\/api\/admin.*/) ) {
    enable = true;
  }

  if( enable ) cors(req, res, next);
  else next();
}

// setup main proxy server
const proxy = httpProxy.createProxyServer({
  selfHandleResponse: true
});
proxy.on('error', err => logger.error('Gateway proxy error:', err));
proxy.on('proxyRes', async (proxyRes, req, res) => {

  // if this is a response from the authorization service, check for authorized agent header
  if( req.originalUrl.match(/^\/auth\/.*/) && proxyRes.headers['x-vessel-authorized-agent'] ) {
    // mint jwt token and set in cookie
    let body = await readBody(proxyRes);
    await auth.handleLogin(res, proxyRes.headers['x-vessel-authorized-agent'], JSON.parse(body).properties);
    res.redirect(config.authService.loginRedirect);
    return;

  // if this is a logout request, handle here (destroy cookie)
  } else if( req.originalUrl.match(/^\/auth\/logout/) ) {
    auth.handleLogout(req, res);
    res.redirect(config.authService.logoutRedirect);
    return;
  }

  // make sure we set all headers from response
  // since we are handling reponses manually in this function
  // we have to set headers ourselves
  for( let key in proxyRes.headers ) {
    res.setHeader(key, proxyRes.headers[key]);
  }

  // set response status code
  res.status(proxyRes.statusCode);

  // pipe body to original express response
  proxyRes.pipe(res);
});

function readBody(res) {
  return new Promise((resolve, reject) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      resolve(body.toString())
    }); 
  });
}

// handle websocket upgrade requests
server.on('upgrade', (req, socket, head) => {
  proxy.ws(req, socket, head, {
    target: config.gateway.wsHosts.client
  });
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
    target: config.gateway.serviceHosts.model+req.originalUrl.replace(/^\/indexer\/model/, ''),
    ignorePath: true
  });
});

app.use(/^\/auth(\/.*|$)/, (req, res) => {
  proxy.web(req, res, {
    target: config.gateway.serviceHosts.auth+req.originalUrl,
    ignorePath: true
  });
});


let fusekiPublicRegex = new RegExp('/fuseki/'+config.fuseki.database+'(/.*|$)');
app.use(fusekiPublicRegex, middleware.acl(), (req, res) => {
  proxy.web(req, res, {
    target: 'http://'+config.fuseki.host+':'+config.fuseki.port+'/'+config.fuseki.database+'/query',
    ignorePath: true
  });
});

let fusekiPrivateRegex = new RegExp('/fuseki/'+config.fuseki.privateDatabase+'(/.*|$)');
app.use(fusekiPrivateRegex, middleware.roles([config.fuseki.privateDatabaseRole]), (req, res) => {
  proxy.web(req, res, {
    target: 'http://'+config.fuseki.host+':'+config.fuseki.port+'/'+config.fuseki.privateDatabase+'/query',
    ignorePath: true
  });
});

// send all other requests to defined above to client
app.use(/.*/, (req, res) => {
  proxy.web(req, res, {
    target: config.gateway.serviceHosts.client+req.originalUrl,
    ignorePath: true
  });
});

/**
 * Start Server
 */
server.listen(config.gateway.port, () => {
  logger.info('gateway listening on port: '+config.gateway.port);
  require('./lib/default-admins')();
})
