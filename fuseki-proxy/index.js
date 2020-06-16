const express = require('express');
const httpProxy = require('http-proxy');
const {kafka, config} = require('@ucd-lib/rp-node-utils');

const app = express();
const proxy = httpProxy.createProxyServer({})

let openRequests = [];
class BodyWrapper {
  constructor(req, res) {
    this.req = req;
    this.res = res;
    this.data = '';

    req.on('data', data => this.data += data.toString());
  }
}

kafka.init(true);

proxy.on('proxyRes', function (proxyRes, req, res) {
  if( req.get('content-type') === 'application/sparql-update' ) {
    let index = openRequests.findIndex(bw => bw.req === req);
    if( index > -1 ) {
      let bw = openRequests.splice(index, 1)[0];
      kafka.send({
        topic : config.kafka.topics.fusekiUpdates,
        messages : [JSON.stringify({
          headers: bw.req.headers,
          body: bw.data,
          ip: req.ip
        })]
      })
    }
  }
});

app.all(/.*/, (req, res) => {
  if( req.get('content-type') === 'application/sparql-update' ) {
    openRequests.push(new BodyWrapper(req, res));
  }
  proxy.web(req, res, { target: 'http://fuseki:3030' });
});

app.listen(3030, () => {
  console.log('Fuseki listening on port 3030');
});