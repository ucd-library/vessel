const {config, auth, logger} = require('@ucd-lib/rp-node-utils');

const ALLOWED_PATHS = config.server.allowedPaths.map(path => {
  if( !path.match(/^\^/) ) path = '^'+path;
  return new RegExp(path);
});
ALLOWED_PATHS.push(/^\/auth\/.*/);

if( config.server.private ) {
  logger.info(`Server is set to private with the following paths open to public: `, ALLOWED_PATHS);
}

/**
 * @function private-instance
 * @description ExpressJS middleware for implementing Access Control
 * 
 * @param {Object} req 
 * @param {Object} res 
 * @param {Function} next 
 */
module.exports = async (req, res, next) => {
  // server is public, everyone can access
  if( config.server.private === false ) return next();

  // the request path is in the allowed path list, not a restricted resource
  for( let pathRe of ALLOWED_PATHS ) {
    if( req.originalUrl.match(pathRe) ) {
      return next();
    }
  }

  // Grab the user provided token (Cookie or Authorization header)
  let token = auth.getTokenFromRequest(req);
  if( !token ) {
    return res.status(401).json({error: true, message: 'Unauthorized'});
  }

  // Verify the header
  try {
    req.jwt = await auth.verifyToken(token);
  } catch(e) {
    return res.status(401).json({error: true, message: 'Unauthorized'});
  }

  // All authenticated users are allowed
  if( config.server.allowedRoles.includes('all') ) {
    return next();
  }

  // See if user has allowed role
  let roles = (req.jwt || {}).roles || [];
  for( let role of roles ) {
    if( config.server.allowedRoles.includes(role) ) {
      return next();
    }
  }

  // reject request
  res.status(403).json({error: true, message: 'Forbidden'});
}