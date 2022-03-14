const router = require('express').Router();
const {middleware, auth} = require('@ucd-lib/rp-node-utils');

router.post('/service-token', middleware.admin, async (req, res) => {
  let payload = {
    username : req.body.username,
    roles : req.body.roles,
    ips : req.body.ips
  };

  for( let key in payload ) {
    if( !payload[key] ) {
      return res.status(400)
        .json({error: true, message: 'missing value: '+key});
    }
  }

  if( !Array.isArray(payload.roles) ) {
    return res.status(400)
        .json({error: true, message: 'roles must be an array'});
  }

  if( payload.roles.includes('admin') ) {
    return res.status(400)
        .json({error: true, message: 'service tokens can not have the admin role'});
  }

  try {
    let token = await auth.mintToken(payload, {expiresIn: 60 * 60 * 24 * 365});
    res.json({success: true, token});
  } catch(e) {
    res.status(400).json({error: true, message: e.message});
  }

});

module.exports = router;