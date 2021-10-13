const auth = require('../auth');

/**
 * @function user
 * @description set the req.jwt if jwt exists and valid
 * 
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
module.exports = async (req, res, next) => {
  let token = auth.getTokenFromRequest(req);
  if( !token ) return next();

  try {
    req.jwt = await auth.verifyToken(token);
  } catch(e) {}

  next();
}