const fetch = require('node-fetch');
const config = require('./config')

class Fuseki {

  constructor() {
    this.username = config.fuseki.username;
    this.password = config.fuseki.password;
    this.url = 'http://'+config.fuseki.host+':'+config.fuseki.port;
    this.database = config.fuseki.database;
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