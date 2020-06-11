const defs = {
  'Not Found' : notFound
}

function notFound(req, res, error) {
  res.status(404).json({
    error: true,
    message : error.message
  });
}

module.exports = (req, res, error) => {
  if( defs[error.message] ) {
    return defs[error.message](req, res, error);
  }

  res.status(500).json({
    error: true,
    message : e.message,
    stack : e.stack
  });
}