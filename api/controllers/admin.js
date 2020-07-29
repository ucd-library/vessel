const router = require('express').Router();
// const {Reindex} = require('@ucd-lib/rp-node-utils');

// router.get('/reindex', async (req, res) => {
//   try {
//     let reindexer = new Reindex();
//     reindexer.run();
//     res.json({started: true});
//   } catch(e) {
//     errorHandler(req, res, e);
//   }
// });

module.exports = router;