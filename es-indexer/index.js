const kafka = require('./lib/kafka');
const fuseki = require('./lib/fuseki');
const sparqlModels = require('./lib/sparql');

kafka.consume(async msg => {
  let subjects = JSON.parse(msg.value).subjects;
  
  for( let item of subjects ) {
    for( let type of item.types ) {
      if( sparqlModels[type] ) {
        await load(item.subject, type);
      }
    }
  }
});

async function load(uri, type) {
  console.log('Loading', uri, 'with model', type);
  let sparqlQuery = sparqlModels[type](uri);
  let response = await fuseki.query(sparqlQuery, 'application/ld+json');
  response = await response.json();

  uri = uri.replace('http://experts.library.ucdavis.edu/individual/', 'ucd:');
  let graph = construct(response['@graph'], uri);
  console.log(graph[uri]);
}

function construct(graph, id, crawled={}) {
  if( crawled[id] ) return graph;
  crawled[id] = true;

  if( Array.isArray(graph) ) {
    let g = {};
    for( let node of graph ) {
      g[node['@id']] = node;
    }
    graph = g;
  }

  for( let key in graph[id] ) {
    if( key === '@id' ) continue;

    if( Array.isArray(graph[id][key]) ) {
      for( let i = 0; i < graph[id][key].length; i++ ) {
        let subid = graph[id][key][i];

        if( graph[subid] ) {
          construct(graph, subid, crawled);
          graph[id][key][i] = graph[subid]
        } else {
          graph[id][key][i] = subid
        }
      }
    } else if( graph[graph[id][key]] ) {
      construct(graph, graph[id][key], crawled);
      graph[id][key] = graph[graph[id][key]];
    }
  }

  return graph;
}