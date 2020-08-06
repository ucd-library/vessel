const express = require('express');
const redis = require('redis');
const {logger, config, auth} = require('@ucd-lib/rp-node-utils');
const session = require('express-session');
const RedisStore = require('connect-redis')(session)
const app = express();

// setup redis client for session connection
const redisClient = redis.createClient({
  host: config.redis.host,
  port : config.redis.port
});

// setup redis back express session
app.use(session({
  name              : config.authService.session.name || 'vessel-auth-cas',
  secret            : config.authService.session.cookieSecret,
  resave            : false,
  maxAge            : config.authService.session.cookieMaxAge,
  saveUninitialized : true,
  store             : new RedisStore({ client: redisClient })
}));

require('./controller')(app);

app.listen(config.authService.port, () => {
  logger.info('Auth service ready on port ', config.authService.port);
  
});