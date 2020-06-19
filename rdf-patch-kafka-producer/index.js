const express = require('express');
const httpProxy = require('http-proxy');
const {kafka, config} = require('@ucd-lib/rp-node-utils');

const app = express();
const proxy = httpProxy.createProxyServer({})
proxy.on('error', err => console.log(err));

const GUID_REGEX = /^\/[0-9a-fA-F]{8}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{4}\-[0-9a-fA-F]{12}$/;

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
  let index = openRequests.findIndex(bw => bw.req === req);
  if( index > -1 ) {
    let bw = openRequests.splice(index, 1)[0];
    kafka.send({
      topic : config.kafka.topics.rdfPatch,
      messages : bw.data
    })
  }
});

app.all(/.*/, (req, res) => {
  if( req.method === 'POST' && req.url.match(GUID_REGEX) ) {
    openRequests.push(new BodyWrapper(req, res));
  }
  proxy.web(req, res, { target: 'http://rdf-delta:1066' });
});

app.listen(3030, () => {
  console.log('rdf-patch -> kafka producer up and listening on port: '+3030);
})