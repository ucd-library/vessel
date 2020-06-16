const {sparql, kafka, config} = require('@ucd-lib/rp-node-utils');
const es = require('./lib/elastic-search')
const reindex = require('./lib/reindex');
const changes = require('./lib/get-changes');
const UpdateWindow = require('./lib/update-window');

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

async function load(uri, types) {
  for( let type of types ) {
    if( !sparql.TYPES[type] ) continue;

    console.log('Loading', uri, 'with model', type);
    let result = await sparql.getModel(type, uri);
    await es.insert(result.model);
    console.log('Updated', uri);
    break;
  }
}

const updateWindow = new UpdateWindow(load);


(async function() {
  await kafka.init();
  await kafka.initConsumer([{
    topic: config.kafka.topics.fusekiUpdates,
    partitions: 1,
    replicationFactor: 1
  }])

  kafka.consume(
    [{
      topic: config.kafka.topics.fusekiUpdates, 
      partition: 0
    }],
    {autoCommit: false},
    async msg => {
      msg = JSON.parse(msg.value);
      let update = sparql.parseQuery(msg.body);
      updateWindow.add(changes(update));
    }
  );
})();