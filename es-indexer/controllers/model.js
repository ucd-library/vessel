const router = require('express').Router();
const model = require('../lib/es-sparql-model');

router.get('/:type/:uri', async (req, res) => {
  try {
    let type = decodeURIComponent(req.params.type);
    let uri = decodeURIComponent(req.params.uri);

    res.json(await model.getModel(type, uri));
  } catch(e) {
    res.status(500).json({
      error : {
        message : e.message,
        stack : e.stack
      },
      description : 'Failed to generate model'
    });
  }
});

module.exports = router;