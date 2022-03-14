const router = require('express').Router();
const model = require('../models/miv');
const elasticSearch = require('../models/elastic-search');
const onError = require('./utils/error-handler');
const {auth} = require('@ucd-lib/rp-node-utils');

/**
 * @swagger
 *
 * /api/miv/{username}:
 *   get:
 *     description: Get researchers ris formatted publication list
 *     tags: [MIV RIS Export]
 *     parameters:
 *       - name: username
 *         description: id of researcher
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: ris formatted citations
 *         content:
 *          text/plain
 */
router.get(/^\/.*/, async (req, res) => {
  

  try {
    let id = req.path.replace(/^\//, '');

    // TODO: we need to store a user experts id for this to work
    // if( !username ) {
    //   let user = null;
    //   let token = auth.getTokenFromRequest(req);
    //   if( token ) {
    //     try {
    //       user = await auth.verifyToken(token, auth.getRequestIp(req));
    //       username = user.username.replace(/@.*/, '');
    //     } catch(e) {}
    //   }
    // }

    if( !id ) {
      return onError(req, res, new Error('Invalid parameters'), 'You must supply a user id in path: /api/miv/[userid]');
    }

    let userRecord = (await elasticSearch.get(id))._source;
    res.set('content-type', 'text/plain');
    res.set('transfer-encoding', 'chunked');
    res.set('Content-Disposition', `attachment; filename="${firstValue(userRecord.label).toLowerCase().replace(/ /g, '_')}.ris"`);

    
    await model.export(userRecord['@id'], pub => {
      res.write(pub+'\n');
    });
 
    res.end();
  } catch(e) {
    onError(req, res, e, 'Failed to generate MIV export');
  }

});

function firstValue(val) {
  if( Array.isArray(val) ) {
    return val[0];
  }
  return val;
}

module.exports = router;