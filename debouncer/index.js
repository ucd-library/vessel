const debouncer = require('./lib/debouncer');
debouncer.connect();

// const {kafka, config} = require('@ucd-lib/rp-node-utils');
// (async function() {
//   await kafka.connect();

//   console.log(await kafka.fetchCommits({
//     topic : config.kafka.topics.rdfPatch,
//     partition: 0
//   }))
// })();
