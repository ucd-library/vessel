const env = process.env;
const {URL} = require('url');

// order matters.  Top graphs take precident
let graphs = env.FUSEKI_GRAPHS || '';
if( graphs ) {
  graphs = graphs.split(/\s+/).map(g => g.trim());
} else {
  graphs = [
    'http://iam.ucdavis.edu/',
    'http://oapolicy.universityofcalifornia.edu/',
    'http://experts.ucdavis.edu/'
  ]
}

module.exports = {
  server : {
    url : env.SERVER_URL || 'http://localhost:8080',
    private : env.PRIVATE_SERVER ? env.PRIVATE_SERVER.trim().toLowerCase() === 'true' : true,
    allowedPaths : env.ALLOWED_PATHS ? env.ALLOWED_PATHS.split(/\s+/).map(g => g.trim()) : [],
    allowedRoles : env.ALLOWED_ROLES ? env.ALLOWED_ROLES.split(/\s+/).map(g => g.trim()) : ['admin'],
    env : env.SERVER_ENV || 'dev'
  },

  client : {
    env : env.CLIENT_ENV || 'dev'
  },

  jwt : {
    expiresIn : env.JWT_EXPIRES_IN || 1000 * 60 * 60 * 24 * 30,
    cookieName : env.JWT_COOKIE_NAME || 'rp-ucd-jwt',
  },

  authService : {
    host : env.AUTH_SERVICE_HOST || 'auth',
    port : env.AUTH_SERVICE_PORT || 3000,
    logoutRedirect : env.AUTH_SERVICE_LOGOUT_REDIRECT || '/',
    loginRedirect : env.AUTH_SERVICE_LOGIN_REDIRECT || '/',
    loginPortal : env.AUTH_PORTAL || '',
    session : {
      name : env.AUTH_SESSION_NAME,
      cookieSecret : env.AUTH_SESSION_COOKIE_SECRET || 'testing123',
      maxAge : env.AUTH_SESSION_MAX_AGE ? parseInt(process.env.AUTH_SESSION_MAX_AGE) : (1000 * 60 * 60 * 24 * 30),
    }
  },

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
    graphs,
    rootPrefix : {
      uri : 'http://experts.ucdavis.edu/',
      prefix: 'experts'
    }
  },

  redis : {
    host : process.env.REDIS_HOST || 'redis',
    port : process.env.REDIS_PORT || 6379,
    prefixes : {
      debouncer : 'debouncer-',
      indexer : 'indexer-',
      deleteIndex : 'indexercmd-delete-index-',
      session : 'session-',
      roles : 'role-',
      authProperties : 'auth-props-'
    },
    keys : {
      serverSecret : 'server-secret',
      setAlias : 'indexercmd-set-alias'
    }
  },

  elasticSearch : {
    host : env.ELASTIC_SEARCH_HOST || 'elasticsearch',
    port : env.ELASTIC_SEARCH_PORT || '9200',
    username : env.ELASTIC_SEARCH_USERNAME || 'elastic',
    password : env.ELASTIC_SEARCH_PASSWORD || 'changeme',
    requestTimeout : env.ELASTIC_SEARCH_REQUEST_TIME || 3*60*1000,
    indexAlias : 'research-profiles',
    fields : {
      exclude : ['_', 'citation'],
    }
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

  indexer : {
    port : 3000,
    handleMessageDelay : 5 // seconds
  },

  gateway : {
    port : 3000,
    serviceHosts : {
      auth : env.AUTH_SERVICE_HOST || 'http://auth:3000',
      client : env.CLIENT_SERVICE_HOST || 'http://client:3000',
      api : env.API_SERVICE_HOST || 'http://api:3000',
      indexer : env.INDEXER_SERVICE_HOST || 'http://indexer:3000'
    }
  }
}
