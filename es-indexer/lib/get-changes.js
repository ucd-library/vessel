
module.exports = (msg) => {

  let subjects = {};

  for( let update of msg.updates ) {
    if( update.updateType !== 'insertdelete' ) continue;

    ['insert', 'delete'].forEach(op => {
      if( !update[op] ) return;

      for( let graph of update[op] ) {
        if( graph.type !== 'graph' || !graph.triples ) {
          throw new Error('Sparql update is not of type graph or does not have triple properties: '+JSON.stringify(graph));
        }

        for( term of graph.triples ) {
          if( !term.subject.id || !term.predicate.id ) continue;
          if( term.predicate.id !== 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' ) continue;
          let s = term.subject.id;
          let o = term.object.id;

          if( !subjects[s] ) {
            subjects[s] = [];
          }
          if( !subjects[s].includes(o) ) {
            subjects[s].push(o);
          }
        }
      }
    });

  }

  return subjects;
}