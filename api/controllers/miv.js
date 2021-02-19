const router = require('express').Router();
const model = require('../models/miv');
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
router.get('/:username', async (req, res) => {

  try {
    let username = req.params.username;
    if( !username ) {
      let user = null;
      let token = auth.getTokenFromRequest(req);
      if( token ) {
        try {
          user = await auth.verifyToken(token);
          username = user.username.replace(/@.*/, '');
        } catch(e) {}
      }
    }

    if( !username ) {
      return onError(req, res, new Error('Invalid parameters'), 'You must be logged in or supply a username');
    }

    res.set('content-type', 'text/plain');
    res.set('Content-Disposition', `attachment; filename="${username}.ris"`);
    res.send(await model.export(username));
  } catch(e) {
    onError(req, res, e, 'Failed to generate MIV export');
  }

});

module.exports = router;