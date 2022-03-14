const defs = {
  'Not Found' : notFound
}

function notFound(req, res, error, message) {
  res.status(404).json({
    error: true,
    message : error.message
  });
}

/**
 * @function error-handler
 * @description handle api errors
 * 
 * @param {Object} req 
 * @param {Object} res 
 * @param {Error} error 
 * @param {String} description 
 */
module.exports = (req, res, error, description='') => {
  if( defs[error.message] ) {
    return defs[error.message](req, res, error);
  }

  console.log(error.message);
  console.log(error.stack);
  res.status(400).json({
    error: {
      message : error.message,
      stack : error.stack
    },
    description 
  });
}