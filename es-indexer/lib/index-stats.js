const {kafka, elasticSearch, config} = require('@ucd-lib/rp-node-utils');

class IndexStats {

  constructor() {
    this.kafkaConsumer = new kafka.Consumer({
      'group.id': 'index-stats',
      'metadata.broker.list': config.kafka.host+':'+config.kafka.port,
      'enable.auto.commit': false
    });
  }

  async getUriStats() {
    await this.kafkaConsumer.connect();
    await elasticSearch.connect();

    let subjects = {};
    let ignore = {};

    let watermarks = await this.kafkaConsumer.queryWatermarkOffsets(config.kafka.topics.index);
    this.kafkaConsumer.assign({
      topic : config.kafka.topics.index,
      partition : 0,
      offset: watermarks.lowOffset
    });

    for( let i = watermarks.lowOffset; i < watermarks.highOffset; i++ ) {
      let msg = await this.kafkaConsumer.consumeOne();
      let payload = JSON.parse(msg.value);

      if( payload.cmd ) continue;
      if( ignore[payload.subject] ) continue;

      if( !subjects[payload.subject] ) {
        let docs;
        try {
          docs = await elasticSearch.client.search({
            index: config.elasticSearch.indexAlias,
            body: {
              from : 0,
              size: 1,
              query: {
                bool: {
                  filter: [
                    {term: {uri: payload.subject}}
                  ]
                }
              }
            },
          });
        } catch(e) {
          console.error(payload, e);
          ignore[payload.subject] = true;
          continue;
        }

        if( docs.hits.hits.length ) {
          let item = docs.hits.hits[0]._source;
          subjects[payload.subject] = {
            '@id' : item['@id'],
            '@type' : item['@type'],
            indexerTimestamp : item.indexerTimestamp,
            messages : []
          }
        } else {
          ignore[payload.subject] = true;
          continue;
        }
      }

      subjects[payload.subject].messages.push({
        payload, timestamp: msg.timestamp
      });
    }

    console.log(subjects);


    await this.kafkaConsumer.disconnect();
  }

}
let t = new IndexStats();
t.getUriStats('http://experts.library.ucdavis.edu/individual/ramram');

module.exports = t;