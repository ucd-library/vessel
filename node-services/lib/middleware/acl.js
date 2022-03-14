const auth = require('../auth');
const config = require('../config');

/**
 * @function admin
 * @description express middleware for only allowing admin access to endpoint
 * 
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
module.exports = (opts={}) => 
  async (req, res, next) => {
    let roles, types, token, user;

    if( config.data && config.data.private ) {
      roles = config.data.private.roles || [];
      types = config.data.private.types;
    }

    // no private roles defined
    if( !roles.length ) {
      return next();
    }

    // if there are defined types, ignore
    if( opts.types && opts.types && types.length && !opts.types.some(type => types.includes(type)) ) {
      return next();
    }

    token = auth.getTokenFromRequest(req);
    if( !token ) return res.status(401).json({error: true, message: 'Unauthorized'});

    try {
      user = await auth.verifyToken(token, auth.getRequestIp(req));
    } catch(e) {
      return res.status(401).json({error: true, message: 'Unauthorized'});
    }

    roles = (user || {}).roles || [];
    if( !roles.some(role => config.data.private.roles.includes(role)) &&
      !roles.includes('admin') ) {
      return res.status(401).json({error: true, message: 'Unauthorized'});
    }

    next();
  }