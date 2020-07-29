const router = require('express').Router();

router.use('/model', require('./model'));
router.use('/admin', require('./admin'));

module.exports = router;