const md5 = require('md5');
const {URL} = require('url');
const fuseki = require('./fuseki');
const $rdf = require('rdflib');
const path = require('path');
const fs = require('fs');
const kafka = require('./kafka')

class ScopedImport {

  constructor() {
    this.graphUri = 'https://experts.library.ucdavis.edu/scoped-import';
    this.dataGraphUri = 'https://experts.library.ucdavis.edu/individual';
  }

  getUri(args) {
    return `${this.graphUri}/${args.source}/${args.type}/${args.filename}`
  }

  getMd5(args) {
    if( args.md5 ) return args.md5;
    args.md5 = md5(args.content);
    return args.md5;
  }

  setParams(args) {
    if( args.file ) {
      if( !path.isAbsolute(args.file) ) {
        args.file = path.resolve(process.cwd(), args.file);
      }
      let pathInfo = path.parse(args.file);
      pathInfo.dir = pathInfo.dir.split('/');
      args.filename = pathInfo.base;
      if( !args.type && pathInfo.dir.length > 1 ) {
        args.type = pathInfo.dir[pathInfo.dir.length-1];
      }
      if( !args.source && pathInfo.source.length > 2 ) {
        args.source = pathInfo.dir[pathInfo.dir.length-2];
      }
    }

    if( !args.content && args.file ) {
      args.content = fs.readFileSync(args.file, 'utf-8');
    }
  }

  async sync(args) {
    if( !args.rootDir ) throw new Error('rootDir required for sync');
    if( !path.isAbsolute(args.rootDir) ) {
      args.rootDir = path.resolve(process.cwd(), args.rootDir);
    }

    let types = fs.readdirSync(args.rootDir);
    for( let type of types ) {
      let files = await fs.readdirSync(path.join(args.rootDir, type));
      for( let file of files ) {
        let fargs = {
          file : path.join(args.rootDir, type, file),
          source : args.source
        }
        await this.update(fargs);
      }
    }

    
    let response = await fuseki.query(`SELECT ?subject
    WHERE {
      GRAPH <${this.graphUri}> { ?subject ?predicate ?object }
      FILTER( <${this.graphUri}/source> = ?predicate )
    }`);

    response = await response.json();
    for( let term of response.results.bindings ) {
      let p = new URL(term.subject.value).pathname.split('/');
      let filename = p.pop();
      let type = p.pop();

      let file = path.join(args.rootDir, type, filename);
      if( !fs.existsSync(file) ) {
        await this.delete({source: args.source, type, filename});
      }
    }
  }


  async delete(args) {
    let fileScopeUri = this.getUri(args);
    let response = await fuseki.query(`SELECT ?object
    WHERE {
      GRAPH <${this.graphUri}> { ?subject ?predicate ?object }
      FILTER( <${this.graphUri}/data> = ?predicate )
    }`);
    response = await response.json();
    
    let data = response.results.bindings.map(item => item.object.value.toString());
    
    let deleteStmt = `DELETE {
      GRAPH <${this.graphUri}> {
        <${fileScopeUri}> ?predicate ?object
      }
      GRAPH <${this.dataGraphUri}> {
        ${data.join('\n')}
      }
    }
  WHERE {
    GRAPH <${this.graphUri}> { <${fileScopeUri}> ?predicate ?object }
  }`;

    let resp = await fuseki.update(deleteStmt);
    if( resp.status !== 204 ) {
      throw new Error(`Failed to update (${args.source}/${args.type}/${args.filename}) DELETE ${resp.status}:  ${await resp.text()}`);
    } else {
      console.log('Remove: '+fileScopeUri);
    }
  }

  async update(args) {
    this.setParams(args);
    
    ['filename', 'content', 'source', 'type'].forEach(requirement => {
      if( !args[requirement] ) throw new Error('Now '+requirement+' provided: '+JSON.stringify(args));
    });

    let result = await this.checkCache(args);
    if( result.cached && args.force !== true ) {
      console.log(`Ignoring (${args.source}/${args.type}/${args.filename}): no changes`);
      return null;
    }
  
    result = await this.insert(args, result);
    console.log(`Updated ${result.fileUri}
  -> Subject: ${result.subjects.join('\n  -> Subject: ')}`)

    let response = await fuseki.query(`CONSTRUCT {
      ${result.subjects.map((s, i) => `<${s}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?o${i} . `).join('\n')}
    } WHERE {
      GRAPH <${this.dataGraphUri}> { 
        ${result.subjects.map((s, i) => `<${s}> <http://www.w3.org/1999/02/22-rdf-syntax-ns#type> ?o${i} .`).join('\n')}
      }
    }`);
    response = await response.text();
    const store = $rdf.graph();
    $rdf.parse(response, store, this.graphUri, 'text/turtle');

    let subjects = {};
    store.statements.forEach(stmt => {
      let s = stmt.subject.value;
      let o = stmt.object.value;
      if( !subjects[s]) subjects[s] = [];
      if( !subjects[s].includes(o) ) subjects[s].push(o);
    });
    result.subjects = [];
    for( let subject in subjects ) {
      result.subjects.push({
        subject,
        types: subjects[subject]
      });
    }

    await kafka.send({
      topic : 'fuseki-updates',
      messages : [JSON.stringify(result)]
    }, args.source);

    return result;
  }

  async checkCache(args) {
    let hash = this.getMd5(args);

    let fileScopeUri = this.getUri(args);
    let response = await fuseki.query(`CONSTRUCT { ?subject ?predicate ?object
  } WHERE {
      GRAPH <${this.graphUri}> { ?subject ?predicate ?object }
      FILTER( ?subject = <${fileScopeUri}> )
    }`, 'text/turtle');

    let ttl = await response.text();
    if( !ttl ) return {cached: false, statements: [], ttl: ''};

    const store = $rdf.graph();
    $rdf.parse(ttl, store, this.graphUri, 'text/turtle');

    let md5lit = store.statements.find(val => val.predicate.value === 'https://experts.library.ucdavis.edu/scoped-import/md5');
    if( !md5lit ) return {cached: false, statements: store.statements, ttl};

    return {
      cached: (md5lit.object.value === hash),
      statements: store.statements, ttl
    };
  }

  async insert(args, cache) {
    let hash = this.getMd5(args);
    const store = $rdf.graph();
    $rdf.parse(args.content, store, this.graphUri, 'application/rdf+xml');

    let subjects = store.statements.reduce((arr, stmt) => {
      if( !arr.includes(stmt.subject.value) ) arr.push(stmt.subject.value);
      return arr;
    }, []);

    
    let fileScopeUri = this.getUri(args);

    let oldValues = '';
    if( cache.statements && cache.statements.length ) {
      let cacheTerms = cache.statements.map(stmt => this.statementToTriple(stmt));
      
      oldValues = cache.statements.find(stmt => stmt.predicate.value == this.graphUri+'/data');
      let oldGraphValues = '';
      if( oldValues ) {
        oldGraphValues = `GRAPH <${this.dataGraphUri}> {
          ${oldValues.object.value.toString()}
        }`;
      }

      let deleteStmt = `DELETE {
    GRAPH <${this.graphUri}> {
      ${cacheTerms.join(' .\n    ')} .
    }
    ${oldGraphValues}
  }
WHERE {}`;
      let resp = await fuseki.update(deleteStmt);
      if( resp.status !== 204 ) {
        throw new Error(`Failed to update (${args.source}/${args.type}/${args.filename}) DELETE ${result.status}:  ${await result.text()}`);
      }
    }

    let contentTerms = store.statements.map(stmt => this.statementToTriple(stmt));
    let data = contentTerms.join(' .\n    ')+' .';

    let insertStmt = `INSERT {
  GRAPH <${this.graphUri}> {
    <${fileScopeUri}> <${this.graphUri}/data> ${$rdf.lit(data).toNQ()} .
    <${fileScopeUri}> <${this.graphUri}/md5> "${hash}" .
    <${fileScopeUri}> <${this.graphUri}/type> "${args.type}" .
    <${fileScopeUri}> <${this.graphUri}/source> "${args.source}" .
    <${fileScopeUri}> <${this.graphUri}/filename> "${args.filename}" .
    <${fileScopeUri}> <${this.graphUri}/graph> "${this.dataGraphUri}" .
    ${subjects.map(s => `<${fileScopeUri}> <${this.graphUri}/subject> <${s}> .`).join('\n    ')}
  }
  GRAPH <${this.dataGraphUri}> {
    ${data}
  }
} 
WHERE {}`;

    let resp = await fuseki.update(insertStmt);
    if( resp.status !== 204 ) {
      throw new Error(`Failed to update (${args.source}/${args.type}/${args.filename}) DELETE ${result.status}:  ${await result.text()}`);
    }

    return {
      data : {
        old : oldValues.object ? oldValues.object.value.toString() : '',
        new : data
      },
      fileUri: fileScopeUri,
      subjects
    }
  }

  hasValue(set, item) {
    return set.findIndex(i => {
      (i.object || {}).value === (item.object)
    })
  }

  statementToTriple(triple) {
    return `${triple.subject.toNQ()} ${triple.predicate.toNQ()} ${triple.object.toNQ()}`;
  }


  // add diff and file n3 to kafka

}

module.exports = new ScopedImport();