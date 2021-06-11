const fetch = require('node-fetch')
const config = require('./config');
const baseUrl = `http://${config.models.serviceName}:${config.models.port}`;

class EsSqarqlModels {

  constructor() {
    this.clearCache();
  }

  clearCache() {
    this.cache = {
      metadata : null
    }
  }

  async getModel(type, uri) {
    let modelType = await this.hasModel(type);
    if( !modelType ) throw new Error('Unknown type: '+type);

    let response = await fetch(`${baseUrl}/${modelType}/${encodeURIComponent(uri)}`);
    let data = await response.json();

    if( !data.model || !data.uri ) {
      throw new Error(`Bad model response for ${uri}: ${JSON.stringify(data, '  ', '  ')}`);
    }

    return data;
  }

  /**
   * @method hasModel
   * @description give a type (es model name or rdf uri) return the 
   * es model name if a model is registered or false.
   * 
   * @param {String} type 
   * 
   * @returns {String|Boolean}
   */
  async hasModel(type) {
    if( !this.cache.metadata ) {
      await this.info();
    }

    if( this.cache.metadata.models[type] ) return type;
    return this.cache.metadata.types[type] ? this.cache.metadata.types[type] : false;
  }

  async info() {
    if( !this.cache.metadata ) {
      let response = await fetch(`${baseUrl}/`);
      this.cache.metadata = await response.json();
    }
    return this.cache.metadata;
  }
}

module.exports = new EsSqarqlModels();