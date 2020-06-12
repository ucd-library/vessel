const kafka = require('./lib/kafka');
const sparqlModels = require('./lib/sparql');
const es = require('./lib/elastic-search')
const reindex = require('./lib/reindex');

let enabled = true;

kafka.consume(async msg => {
  msg = JSON.parse(msg.value);

  if( msg.command ) {
    if( msg.command === 'toggle-indexing' ) {
      enabled = msg.value;
      console.log('Toggling indexing listen: '+enabled);
    } else if( msg.command === 'reindex' ) {
      await reindex.run();
    }
    return;
  }
  if( !enabled ) return;

  let subjects = msg.subjects;
  
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
  console.log(JSON.stringify(result.model, '  ', '  '));
  await es.insert(result.model);
}
