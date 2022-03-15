const {Storage} = require('@google-cloud/storage');
const {config, logger} = require('@ucd-lib/rp-node-utils');

class GCS {

  constructor() {
    this.storage = new Storage();
  }

  bucket() {
    return this.storage.bucket(config.google.storage.bucket);
  }

  file(filename, opts) {
    return this.bucket().file(filename, opts);
  }

  async getTypeFiles(type) {
    let [files] = await this.bucket().getFiles({ prefix: type+'/', autoPaginate:false});
    return files.filter(file => file && file.name.match(/\.json$/));
  }

  async parallelDownload(list, opts={}, callback) {
    if( typeof opts === 'function' ) {
      callback = opts;
      opts = {};
    }
    if( Object.keys(opts).length === 0 ) {
      opts.concurrent = 2;
    }

    let size = Math.ceil(list.length / opts.concurrent);
    let arrays = [];
    for( let i = 0; i < opts.concurrent; i++ ) {
      arrays.push(list.splice(0, size));
    }

    return Promise.all(
      arrays.map(arr => this._parallelDownloadList(arr, callback))
    )
  }

  async _parallelDownloadList(list, callback) {
    for( let file of list ) {
      try {
        logger.info('Downloading '+file.name+' from gcs');
        let contents = await file.download();
        await callback(null, file, JSON.parse(contents.toString('utf-8')));
      } catch(e) {
        await callback(e, file);
      }
    }
  }

}

const instance = new GCS();
module.exports = instance;