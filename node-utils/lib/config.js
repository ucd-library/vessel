const env = process.env;

// order matters.  Top graphs take precident
let graphs = env.FUSEKI_GRAPHS || '';
if( graphs ) {
  graphs = graph.split(';').map(g => g.trim());
} else {
  graphs = [
    'https://experts.library.ucdavis.edu/individual',
    'http://iam.ucdavis.edu/ns'
  ]
}

module.exports = {
  kafka : {
    host : env.KAFKA_HOST || 'kafka',
    port : env.KAFKA_PORT || 9092,
    topics : {
      index : 'index-rdf-subject',
      rdfPatch : 'fuseki-rdf-patch'
    }
  },

  fuseki : {
    username : env.FUSEKI_USERNAME || 'admin',
    password : env.FUSEKI_PASSWORD || 'testing123',
    host : env.FUSEKI_HOST || 'fuseki',
    port : env.FUSEKI_PORT || 3030,
    database : env.FUSEKI_DATABASE || 'vivo',
    graphs
  },

  redis : {
    host : process.env.REDIS_HOST || 'redis',
    port : process.env.REDIS_PORT || 6379
  },

  elasticSearch : {
    host : env.ELASTIC_SEARCH_HOST || 'elasticsearch',
    port : env.ELASTIC_SEARCH_PORT || '9200',
    username : env.ELASTIC_SEARCH_USERNAME || 'elastic',
    password : env.ELASTIC_SEARCH_PASSWORD || 'changeme',
    requestTimeout : env.ELASTIC_SEARCH_REQUEST_TIME || 3*60*1000
  }
}