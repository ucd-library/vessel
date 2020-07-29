const Reindex = require('./lib/reindex');
let reindex = new Reindex();
(async function() {
  await reindex.run('http://vivoweb.org/ontology/core#FacultyMember');
  process.exit();
})();