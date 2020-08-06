/**
 * @function error-handler
 * @description handle api errors
 * 
 * @param {*} req 
 * @param {*} res 
 * @param {*} error 
 * @param {*} description 
 */
module.exports = (req, res, error, description='') => {
  res.status(500).json({
    error: {
      message : error.message,
      stack : error.stack
    },
    description 
  });
}