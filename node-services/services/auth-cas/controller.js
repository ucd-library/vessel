const {logger, config} = require('@ucd-lib/rp-node-utils');
const CASAuthentication = require('cas-authentication');

const AGENT_DOMAIN = process.env.CAS_AGENT_DOMAIN || getRootDomain(process.env.CAS_URL);

let cas = new CASAuthentication({
  cas_url     : process.env.CAS_URL,
  service_url : config.server.url,
  session_info : 'session_info'
});

function init(app) {

  // handle main login route
  app.get('/auth/login', (req, res) => {
    logger.info('CAS Service: starting CAS redirection');

    // this either bounces user to CAS login portal or handles response token
    cas.bounce(req, res, async () => {
      logger.info('CAS Service: CAS redirection complete');

      // setup session
      let username = '';
      if( cas.session_name && req.session[cas.session_name] ) {
        username = req.session[cas.session_name];
      }

      let properties = req.session[cas.session_info];
      if( !properties.roles ) properties.roles = [];
      properties.roles.push('cas');

      if( username ) {
        logger.info('CAS Service: CAS login success: '+username);
        res.set('X-VESSEL-AUTHORIZED-AGENT', username+'@'+AGENT_DOMAIN)
            .json({
              success: true, 
              username: username+'@'+AGENT_DOMAIN,
              properties: req.session[cas.session_info]
            });
      } else {
        logger.info('CAS Service: CAS login failure');
        res.status(401).send();
      }
    });
  });

  // kill the session on logout
  app.get('/auth/logout', (req, res) => {
    req.session.destroy();
    res.status(204).end();
  });
}

// We use the root domain of the cas url to provide the username domain (ex: @ucdavis.edu)
function getRootDomain(url='') {
  if( !url.match(/^http/) ) url = 'http://'+url;
  url = new URL(url);
  let parts = url.hostname.replace(/\.$/, '').split('.');
  if( parts.length === 1) return parts[0];
  return parts.splice(parts.length-2, parts.length-1).join('.').toLowerCase();
}

module.exports = init;