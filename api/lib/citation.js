const Cite = require('citation-js');

class Citation {

  constructor() {
    this.engine = new Cite();
  }

  convert(data, opts={}) {
    // if( !opts.style ) opts.style = 'ris';
    // opts.format = 'string';

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
      item.type = 'article';

      return item;
    });

    return this.engine.set(data).format('ris');
    // this.engine.set(data).get(opts);
  }


}

module.exports = new Citation();