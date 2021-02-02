const router = require('express').Router();
const model = require('../models/subject-terms');
const onError = require('./utils/error-handler');

/**
 * @swagger
 *
 * /api/subject-term/broader/{id}:
 *   get:
 *     description: Get broader terms for provided subject id
 *     tags: [Subject Term Broader]
 *     parameters:
 *       - name: id
 *         description: id of subject term
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Terms array
 *         content:
 *           application/json:
 *              schema:
 *                type: object
 */
router.get('/broader/:id', async (req, res) => {
  try {
    res.send(await model.broader(req.params.id));
  } catch(e) {
    onError(req, res, e, 'Failed to get broader terms');
  }
});

/**
 * @swagger
 *
 * /api/subject-term/narrower/{id}:
 *   get:
 *     description: Get narrower terms for provided subject id
 *     tags: [Subject Term Narrower]
 *     parameters:
 *       - name: id
 *         description: id of subject term
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Terms array
 *         content:
 *           application/json:
 *              schema:
 *                type: object
 */
router.get('/narrower/:id', async (req, res) => {
  try {
    res.send(await model.narrower(req.params.id));
  } catch(e) {
    onError(req, res, e, 'Failed to get narrower terms');
  }
});

module.exports = router;