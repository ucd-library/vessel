const router = require('express').Router();
const model = require('../models/elastic-search');

router.get('/:id', async (req, res) => {
  try {
    console.log(req.param.id);
    res.json(await model.get(req.params.id));
  } catch(e) {
    res.status(500).json({
      error: true,
      message : e.message,
      stack : e.stack
    });
  }
});

module.exports = router;