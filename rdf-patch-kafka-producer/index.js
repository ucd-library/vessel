const express = require('express');
const httpProxy = require('http-proxy');
const {kafka, config} = require('@ucd-lib/rp-node-utils');
const streamify = require('stream-array');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.text({type: '*/*'}));

const proxy = httpProxy.createProxyServer({})
proxy.on('error', err => {
  console.log('here');
  console.log(err)
});

process.on('uncaughtException', e => {
  console.error('here2', e);
});

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
    console.log(req.url, res.statusCode);
    console.log(proxyRes.url, proxyRes.statusCode, proxyRes.headers)
    
    let bw = openRequests.splice(index, 1)[0];
    console.log(bw.data);
    kafka.send({
      topic : config.kafka.topics.rdfPatch,
      messages : bw.data
    })
  }
});

app.all(/.*/, (req, res) => {
  if( typeof req.body !== 'string' ) req.body = '';

  if( req.method === 'POST' && req.url.match(GUID_REGEX) ) {
    openRequests.push(new BodyWrapper(req, res));
    console.log( req.method, req.url, req.headers);
    console.log(typeof req.body, req.body);
  }

  let t= {
    target: 'http://rdf-delta:1066'
  }
  if( req.body ) t.buffer = streamify([req.body]);

  proxy.web(req, res, t);
});

app.listen(3030, () => {
  console.log('rdf-patch -> kafka producer up and listening on port: '+3030);
})