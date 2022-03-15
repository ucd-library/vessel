const fetch = require('node-fetch');
const config = require('./config')

class Fuseki {

  constructor() {
    this.username = config.fuseki.username;
    this.password = config.fuseki.password;
    this.url = 'http://'+config.fuseki.host+':'+config.fuseki.port;
    this.database = config.fuseki.database;
  }

  /**
   * @method query
   * @description send SPARQL query to fuseki.  Can provide optional response
   * type but defaults to 'application/sparql-results+json'
   * 
   * @param {String} query SPARQL statement
   * @param {String} responseType Optional.  response mime type, defaults to application/sparql-results+json
   * 
   * @returns {Promise} resolves to fetch response object
   */
  async query(query, responseType) {
    return fetch(this.url+'/'+this.database+'/query', {
      method : 'POST',
      headers : this._setAuthorization({
        accept : (responseType || 'application/sparql-results+json')+',*/*;q=0.9',
        'Content-Type': 'application/sparql-query'
      }),
      body : query
    });
  }

  /**
   * @method update
   * @description send SPARQL update to fuseki.
   * 
   * @param {String} update SPARQL statement
   * 
   * @returns {Promise} resolves to fetch response object
   */
  async update(update) {
    return fetch(this.url+'/'+this.database+'/sparql', {
      method : 'POST',
      headers : this._setAuthorization({
        accept : 'application/sparql-results+json,*/*;q=0.9',
        'Content-Type': 'application/sparql-update'
      }),
      body : update
    });
  }

  /**
   * @method update
   * @description send SPARQL update to fuseki.
   * 
   * @param {String} update SPARQL statement
   * 
   * @returns {Promise} resolves to fetch response object
   */
     async updateJsonld(update) {
      if( typeof update === 'object' ) {
        update = JSON.stringify(update);
      }

      return fetch(this.url+'/'+this.database+'/data', {
        method : 'POST',
        headers : this._setAuthorization({
          'Content-Type': 'application/ld+json'
        }),
        body : update
      });
    }

  /**
   * @method _setAuthorization
   * @description helper method for setting authorization header in fuseki query
   * 
   * @param {Object} headers 
   * 
   * @returns {Object}
   */
  _setAuthorization(headers) {
    if( this.username || this.password ) {
      headers.authorization = 'Basic '+Buffer.from(this.username+':'+this.password).toString('base64');
    }
    return headers;
  }

}

module.exports = new Fuseki();