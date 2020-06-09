const kafka = require('./lib/kafka');
const fuseki = require('./lib/fuseki');
const sparqlModels = require('./lib/sparql');
const es = require('./lib/elastic-search')

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
  let model = await sparqlModels.getModel(type, uri)
  console.log(model);
  // await es.insert(graph[uri]);
}

