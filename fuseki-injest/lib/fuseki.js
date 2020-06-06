const fetch = require('node-fetch');

class Fuseki {

  constructor() {
    this.username = 'admin';
    this.password = 'justinisgreat';
    this.url = 'http://fuseki:3030';
    this.database = 'vivo';
  }

  async query(query, responseType) {
    return fetch(this.url+'/'+this.database, {
      method : 'POST',
      headers : {
        accept : (responseType || 'application/sparql-results+json')+',*/*;q=0.9',
        authorization : 'Basic '+Buffer.from(this.username+':'+this.password).toString('base64'),
        'Content-Type': 'application/sparql-query'
      },
      body : query
    });
  }

  async update(query) {
    return fetch(this.url+'/'+this.database, {
      method : 'POST',
      headers : {
        accept : 'application/sparql-results+json,*/*;q=0.9',
        authorization : 'Basic '+Buffer.from(this.username+':'+this.password).toString('base64'),
        'Content-Type': 'application/sparql-update'
      },
      body : query
    });
  }



}

module.exports = new Fuseki();