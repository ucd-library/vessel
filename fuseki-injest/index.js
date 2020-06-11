const $rdf = require('rdflib');
const fs = require('fs');
const scopedImport = require('./lib/scoped-import');

// const content = fs.readFileSync('/data/user/13847', 'utf-8')
// const store = $rdf.graph();
// const uri = 'https://library.ucdavis.edu/elements/user/13847';

// try {
//   let result = $rdf.parse(content, store, uri, 'application/rdf+xml')
//   console.log(store.statements);
// } catch (err) {
//   console.log(err)
// }

(async function() {
  // let types = fs.readdirSync('/data');
  // for( let type of types ) {
  //   let files = await fs.readdirSync(`/data/${type}`);
  //   for( let file of files ) {
  //     let args = {
  //       file : `/data/${type}/${file}`,
  //       source : 'elements'
  //     }
  //     await scopedImport.update(args);
  //   }
  // }

  await scopedImport.sync({
    rootDir: '/data',
    source : 'elements',
    force : true
  });
  
  // const args = {
  //   file : '/data/user/18278',
  //   source : 'elements',
  //   type : 'user',
  //   force : true
  // };
  // const args = {
  //   file : '/data/relationship/2254025',
  //   source : 'elements',
  //   type : 'relationship',
  //   force : true
  // };
  // await scopedImport.update(args);

  process.exit();
})();