const express = require('express');
const {logger, redis, config} = require('@ucd-lib/rp-node-utils');
const session = require('express-session');
const RedisStore = require('connect-redis')(session)
const app = express();

redis.connect();

app.use(session({
  name              : config.authService.session.name || 'vessel-auth-cas',
  secret            : config.authService.session.cookieSecret,
  resave            : false,
  maxAge            : config.authService.session.cookieMaxAge,
  saveUninitialized : true,
  store             : new RedisStore({ client: redis.client })
}));

require('./controller')(app);

app.listen(config.authService.port, () => {
  logger.info('Auth service ready on port ', config.authService.port);
});