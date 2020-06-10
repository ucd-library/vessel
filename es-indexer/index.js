const kafka = require('./lib/kafka');
const fuseki = require('./lib/fuseki');
const sparqlModels = require('./lib/sparql');
const es = require('./lib/elastic-search')
const reindex = require('./lib/reindex');

kafka.consume(async msg => {
  let subjects = JSON.parse(msg.value).subjects;
  
  for( let item of subjects ) {
    for( let type of item.types ) {
      if( sparqlModels.hasModel(type) ) {
        await load(type, item.subject);
      }
    }
  }
});

async function load(type, uri) {
  console.log('Loading', uri, 'with model', type);
  let result = await sparqlModels.getModel(type, uri);
  console.log(result.model);
  await es.insert(result.model);
}

// (async function() {
//   await reindex.run();
//   process.exit();
// })();