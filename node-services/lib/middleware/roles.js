const auth = require('../auth');
const config = require('../config');

/**
 * @function admin
 * @description express middleware for only allowing defined roles
 * 
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
module.exports = (roles=[]) => 
  async (req, res, next) => {
    let token, user;
    if( !Array.isArray(roles) ) roles = [];

    token = auth.getTokenFromRequest(req);
    if( !token ) return res.status(401).json({error: true, message: 'Unauthorized'});

    try {
      user = await auth.verifyToken(token, auth.getRequestIp(req));
    } catch(e) {
      return res.status(401).json({error: true, message: 'Unauthorized'});
    }

    let userRoles = (user || {}).roles || [];
    if( !userRoles.includes('public') ) userRoles.push('public');

    if( !roles.some(role => userRoles.includes(role)) &&
      !userRoles.includes('admin') ) {
      return res.status(401).json({error: true, message: 'Unauthorized'});
    }

    next();
  }
