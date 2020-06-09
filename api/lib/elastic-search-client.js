const elasticsearch = require('elasticsearch');
const client = new elasticsearch.Client({
  host: 'http://elastic:changeme@elasticsearch:9200',
  requestTimeout : 3*60*1000
});

module.exports = client;