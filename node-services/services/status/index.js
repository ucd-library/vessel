const StatusWorker = require('./lib/status-worker');

let worker = new StatusWorker();
worker.connect();