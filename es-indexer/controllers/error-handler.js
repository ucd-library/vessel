module.exports = (req, res, error, description='') => {
  res.status(500).json({
    error: {
      message : error.message,
      stack : error.stack
    },
    description 
  });
}