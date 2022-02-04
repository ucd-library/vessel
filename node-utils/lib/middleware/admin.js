const auth = require('../auth');

/**
 * @function admin
 * @description express middleware for only allowing admin access to endpoint
 * 
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
module.exports = async (req, res, next) => {
  let token = auth.getTokenFromRequest(req);
  if( !token ) return res.status(401).json({error: true, message: 'Unauthorized'});

  try {
    req.jwt = await auth.verifyToken(token, auth.getRequestIp(req));
  } catch(e) {
    return res.status(401).json({error: true, message: 'Unauthorized'});
  }

  if( !auth.isAdmin(req.jwt) ) {
    res.status(403).json({error: true, message: 'Forbidden'});
  }

  next();
}