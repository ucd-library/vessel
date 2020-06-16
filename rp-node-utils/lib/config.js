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
      fusekiUpdates : 'fuseki-sparql-update'
    }
  },
  fuseki : {
    username : env.FUSEKI_USERNAME || 'admin',
    password : env.FUSEKI_PASSWORD || 'testing123',
    host : env.FUSEKI_HOST || 'fuseki',
    port : env.FUSEKI_PORT || 3030,
    database : env.FUSEKI_DATABASE || 'vivo',
    graphs
  }
}