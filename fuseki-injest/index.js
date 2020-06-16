const scopedImport = require('./lib/scoped-import');

(async function() {

  const args = {
    file : '/data/user/18278',
    source : 'elements',
    type : 'user',
    force : true
  };
  // const args = {
  //   file : '/data/relationship/2254025',
  //   source : 'elements',
  //   type : 'relationship'
  // };
  await scopedImport.update(args);

  process.exit();
})();