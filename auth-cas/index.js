const express = require('express');
const redis = require('redis');
const {logger, config, auth} = require('@ucd-lib/rp-node-utils');
const session = require('express-session');
const RedisStore = require('connect-redis')(session)
const app = express();

const redisClient = redis.createClient({
  host: config.redis.host,
  port : config.redis.port
});

app.use(session({
  name              : config.authService.session.name || 'vessel-auth-cas',
  secret            : config.authService.session.cookieSecret,
  resave            : false,
  maxAge            : config.authService.session.cookieMaxAge,
  saveUninitialized : true,
  store             : new RedisStore({ client: redisClient })
}));

require('./controller')(app);

async function initDefaultAdmins() {
  let admins = process.env.DEFAULT_ADMINS;
  if( !admins ) return;
  admins = admins.split(' ').map(admin => admin.trim());

  auth._connect();
  for( let admin of admins ) {
    let result = await auth.redis.client.get(auth.getUserRoleKey(admin, 'admin'));
    if( !result ) {
      logger.info(`Setting default admin: ${admin}`);
      auth.setUserRole(admin, 'admin');
    }
  }
  await auth.redis.disconnect();
}

app.listen(config.authService.port, () => {
  logger.info('Auth service ready on port ', config.authService.port);
  initDefaultAdmins();
});