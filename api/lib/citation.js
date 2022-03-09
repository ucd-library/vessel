const Cite = require('citation-js');

class Citation {

  constructor() {
    this.engine = new Cite();
  }

  convert(data, opts={}) {

    // HACK for demo
    data = data.map(item => {
      item.id = item['@id'];
      delete item['@id'];
      item.author.forEach(a => {
        a.id = a['@id'];
        delete a['cite:rank'];
        delete a['@id'];
      });

      if( item.venue ) {
        item.venue = {id: item.venue};
      }
      // Required  for GEN as ris type, only works for RIS
      if (item.type=='article') {
        item.type='treaty';  // This citeproc -> GEN in RIS
      }
      return item;
    });

    return this.engine.set(data).format('ris');
    // this.engine.set(data).get(opts);
  }


}

module.exports = new Citation();
