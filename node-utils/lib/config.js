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
    },
    groups : {
      debouncer : 'vessel-debouncer-group',
      index : 'vessel-indexer-group'
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
    port : process.env.REDIS_PORT || 6379,
    prefixes : {
      debouncer : 'debouncer-',
      session : 'session-'
    }
  },

  elasticSearch : {
    host : env.ELASTIC_SEARCH_HOST || 'elasticsearch',
    port : env.ELASTIC_SEARCH_PORT || '9200',
    username : env.ELASTIC_SEARCH_USERNAME || 'elastic',
    password : env.ELASTIC_SEARCH_PASSWORD || 'changeme',
    requestTimeout : env.ELASTIC_SEARCH_REQUEST_TIME || 3*60*1000
  },

  google : {
    serviceAccountFile : ''
  },

  logging : {
    name : env.LOGGER_NAME || global.LOGGER_NAME || 'rp-service',
    level : env.LOG_LEVEL || global.LOG_LEVEL || 'info'
  },

  debouncer : {
    handleMessageDelay : 5 // seconds
  },

  gateway : {
    port : env.GATEWAY_PORT || 3000,
    serviceHosts : {
      auth : env.AUTH_SERVICE_HOST || 'http://auth:3000',
      client : env.CLIENT_SERVICE_HOST || 'http://client:3000',
      api : env.API_SERVICE_HOST || 'http://api:3000'
    }
  }
}