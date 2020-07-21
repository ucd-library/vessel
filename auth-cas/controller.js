const {logger, config} = require('@ucd-lib/rp-node-utils');
const CASAuthentication = require('cas-authentication');

const AGENT_DOMAIN = process.env.CAS_AGENT_DOMAIN || getRootDomain(process.env.CAS_URL);

let cas = new CASAuthentication({
  cas_url     : process.env.CAS_URL,
  service_url : config.server.url
});

function init(app) {

  app.get('/auth/login/', (req, res) => {
    logger.info('CAS Service: starting CAS redirection');

    // req.query.returnTo = config.server.url;
    // cas.service_url = config.server.url;

    cas.bounce(req, res, async () => {
      logger.info('CAS Service: CAS redirection complete');

      let username = '';
      if( cas.session_name && req.session[cas.session_name] ) {
        username = req.session[cas.session_name];
      }

      if( username ) {
        logger.info('CAS Service: CAS login success: '+username);
        res.set('X-VESSEL-AUTHORIZED-AGENT', username+'@'+AGENT_DOMAIN)
            .json({success: true, username: username+'@'+AGENT_DOMAIN});
      } else {
        logger.info('CAS Service: CAS login failure');
        res.status(401).send();
      }
    });
  });

  app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.status(204).end();
  });
}

function getRootDomain(url='') {
  if( !url.match(/^http/) ) url = 'http://'+url;
  url = new URL(url);
  let parts = url.hostname.replace(/\.$/, '').split('.');
  if( parts.length === 1) return parts[0];
  return parts.splice(parts.length-2, parts.length-1).join('.').toLowerCase();
}



module.exports = init;