const {sparql, kafka, fuseki, config, elasticSearch} = require('@ucd-lib/rp-node-utils');
// const es = require('./lib/elastic-search')
const reindex = require('./lib/reindex');
const changes = require('./lib/get-changes');
const UpdateWindow = require('./lib/update-window');
const patchParser = require('./lib/patch-parser');

// let enabled = true;

// kafka.consume(async msg => {
//   msg = JSON.parse(msg.value);

//   if( msg.command ) {
//     if( msg.command === 'toggle-indexing' ) {
//       enabled = msg.value;
//       console.log('Toggling indexing listen: '+enabled);
//     } else if( msg.command === 'reindex' ) {
//       await reindex.run();
//     }
//     return;
//   }
//   if( !enabled ) return;

//   let subjects = msg.subjects;
  
//   for( let item of subjects ) {
//     for( let type of item.types ) {
//       if( sparql.hasModel(type) ) {
//         await load(type, item.subject);
//       }
//     }
//   }
// });

async function load(uri) {
  // let types = [];

  let response = await fuseki.query(`select * { GRAPH ?g {<${uri}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?type}}`)
  response = await response.json();
  let types = [...new Set(response.results.bindings.map(term => term.type.value))];

  for( let type of types ) {
    if( !sparql.TYPES[type] ) continue;

    console.log('Loading', uri, 'with model', type);
    let result = await sparql.getModel(type, uri);
    // await es.insert(result.model);
    console.log('Updated', uri);
    break;
  }
}

const updateWindow = new UpdateWindow(load);


(async function() {
  await kafka.init();
  await elasticSearch.connect();

  console.log(config.kafka);
  await kafka.initConsumer([{
    topic: config.kafka.topics.rdfPatch,
    partitions: 1,
    replicationFactor: 1
  }])

  kafka.consume(
    [{
      topic: config.kafka.topics.rdfPatch,
      partition: 0,
      offset: 7
    }],
    {
      autoCommit: false,
      fromOffset: true
    },
    async msg => {
      console.log(msg);
      let update = patchParser(msg.value);
      updateWindow.add(changes(update));
    }
  );
})();