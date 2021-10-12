const {logger, config, auth} = require('@ucd-lib/rp-node-utils');
const express = require('express');
const http = require('http');
const app = express();
const compression = require('compression');
const httpProxy = require('http-proxy');
const cookieParser = require('cookie-parser');
const cookie = require('cookie');
const cors = require('cors')({
  origin: true,
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  exposedHeaders : ['content-type', 'link', 'content-disposition', 'content-length', 'pragma', 'expires', 'cache-control'],
  allowedHeaders : ['authorization', 'range', 'cookie', 'content-type', 'prefer', 'slug', 'cache-control', 'accept'],
  credentials: true
});
const server = http.createServer(app);

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

// handle websocket upgrade requests
server.on('upgrade', async (req, socket, head) => {
  // Grab the user provided token
  let cookies = cookie.parse(req.headers.cookie);
  let token = cookies[config.jwt.cookieName];
  if( !token ) {
    console.log('no cookie, ignoring')
    socket.write('HTTP/1.1 403 Forbidden\r\n');
    socket.end();
    return;
  }

  // Verify the token
  try {
    await auth.verifyToken(token);
  } catch(e) {
    socket.write('HTTP/1.1 403 Forbidden\r\n');
    socket.end();
    return;
  }

  proxy.ws(req, socket, head, {
    target: 'ws://'+config.gateway.serviceHosts.client.replace(/^http:\/\//, '')+req.url,
    ignorePath: true
  });
});

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
