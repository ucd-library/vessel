const {sparql, fuseki} = require('@ucd-lib/rp-node-utils');
const es = require('./elastic-search');

class Reindex {

  async run(type) {
    if( !type ) {
      let count = 0;
      for( let key in sparql.TYPES ) {
        count += (await this._run(key)).length;
      }
      console.log(count);
    } else {
      await this._run(type);
    }
  }

  async _run(type) {
    let subjects = await this.getAllSubjectsForType(type);
    for( let subject of subjects ) {
      console.log('Reindexing: '+subject);
      let result = await sparql.getModel(type, subject);
      // console.log(result.model);
      await es.insert(result.model);
    }
    return subjects;
  }

  async getAllSubjectsForType(type) {
    let response = await fuseki.query(`PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    SELECT ?subject WHERE {
      GRAPH ?g { ?subject rdf:type <${type}> .}
    }`);
    response = await response.json();
    return [...new Set(response.results.bindings.map(term => term.subject.value))];
  }


}

module.exports = new Reindex();