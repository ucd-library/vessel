const router = require('express').Router();
const model = require('../models/elastic-search');
const swaggerSpec = require('./swagger/spec.json');
const errorHandler = require('./utils/error-handler');
const {middleware} = require('@ucd-lib/rp-node-utils');

router.get('/', (req, res) => {
  res.json(swaggerSpec);
});

router.use('/admin', middleware.admin, require('./admin'));
router.use('/search', require('./search'));

/**
 * @swagger
 *
 * /{id}:
 *   get:
 *     description: Get research profile record by id
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         description: id of record
 *         in: path
 *         required: true
 *         type: string
 *     responses:
 *       200:
 *         description: record
 */
router.get('/:id', async (req, res) => {
  try {
    res.json((await model.get(req.params.id))._source);
  } catch(e) {
    errorHandler(req, res, e);
  }
});

module.exports = router;