const {config, auth, logger} = require('@ucd-lib/rp-node-utils');

const ALLOWED_PATHS = config.gateway.allowedPaths.map(path => {
  if( !path.match(/^\^/) ) path = '^'+path;
  return new RegExp(path);
});
ALLOWED_PATHS.push(/^\/auth\/.*/);

if( config.server.private ) {
  logger.info(`Server is set to private with the following paths open to public: `, ALLOWED_PATHS);
}

module.exports = async (req, res, next) => {
  if( config.server.private === false ) return next();

  for( let pathRe in ALLOWED_PATHS ) {
    if( req.originalUrl.match(pathRe) ) {
      return next();
    }
  }

  let token = auth.getTokenFromRequest(req);
  if( !token ) {
    return res.status(401).json({error: true, message: 'Unauthorized'});
  }

  try {
    req.jwt = await auth.verifyToken(token);
  } catch(e) {
    return res.status(401).json({error: true, message: 'Unauthorized'});
  }

  if( !auth.isAdmin(req.jwt) ) {
    res.status(403).json({error: true, message: 'Forbidden'});
    return;
  }

  next();
}