const reindex = require('./lib/reindex');

(async function() {
  await reindex.run();
  process.exit();
})();