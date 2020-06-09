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

  // await scopedImport.sync({
  //   rootDir: '/data',
  //   source : 'elements'
  // });
  
  const args = {
    file : '/data/publication/342878',
    source : 'elements',
    type : 'publication',
    force : true
  };
  scopedImport.update(args);
})();