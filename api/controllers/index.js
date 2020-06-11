const router = require('express').Router();
const model = require('../models/elastic-search');
const swaggerSpec = require('./swagger/spec.json');
const errorHandler = require('./utils/error-handler');

/**
 * @swagger
 *
 * definitions:
 *   record:
 *     type: object
 */


router.get('/', (req, res) => {
  res.json(swaggerSpec);
})

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
    res.json(await model.get(req.params.id));
  } catch(e) {
    errorHandler(req, res, e);
  }
});

module.exports = router;