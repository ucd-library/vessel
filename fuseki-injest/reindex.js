const scopedImport = require('./lib/scoped-import');

(async function() {

  await scopedImport.sync({
    rootDir: '/data',
    source : 'elements',
    force : true
  });

  process.exit();
})();