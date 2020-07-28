const {Reindex} = require('@ucd-lib/rp-node-utils');
let reindex = new Reindex();
(async function() {
  await reindex.run('http://vivoweb.org/ontology/core#FacultyMember');
  process.exit();
})();