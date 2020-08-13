const Cite = require('citation-js');

class Citation {

  constructor() {
    this.engine = new Cite();
  }

  convert(data, opts={}) {
    if( !opts.style ) opts.style = 'ris';
    return this.engine.set(data).get(opt);
  }


}

module.exports = new Citation();