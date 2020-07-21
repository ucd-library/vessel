const auth = require('../auth');

module.exports = async (req, res, next) => {
  let token = auth.getTokenFromRequest(req);
  if( !token ) return res.status(401).json({error: true, message: 'Unauthorized'});

  try {
    req.jwt = await auth.verifyToken(token);
  } catch(e) {
    return res.status(401).json({error: true, message: 'Unauthorized'});
  }

  if( !auth.isAdmin(req.jwt) ) {
    res.status(403).json({error: true, message: 'Forbidden'});
  }

  next();
}