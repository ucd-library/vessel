const fetch = require('node-fetch')
const config = require('./config');
const baseUrl = `http://${config.models.serviceName}:${config.models.port}`;

module.exports = {
  async getModel(type, uri) {
    let response = await fetch(`${baseUrl}/${type}/${encodeURIComponent(uri)}`);
    return response.json();
  },

  async info() {
    let response = await fetch(`${baseUrl}/`);
    return response.json();
  }
}