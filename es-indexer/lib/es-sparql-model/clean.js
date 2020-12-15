// TODO: this is just bad.
class CleanModel {

  run(model) {
    if( model.pageStart ) model.pageStart = model.pageStart.replace(/\D*/g, '');
    if( model.pageEnd ) model.pageEnd = model.pageEnd.replace(/\D*/g, '');

    this.cleanObject(model, 'Authorship');
    this.cleanObject(model, 'hasSubjectArea');
    this.cleanObject(model, 'Journal');

    // author count
    if( model.citation ) {
      if( !Array.isArray(model.citation) ) {
        model.citation = [model.citation];
      }
      model.top20Citation = [];
      model.lastCitation = [];
      
      model.citation = model.citation.map(item => {
        item.authorsCount = asArray(item.authors).length;

        let author = asArray(item.authors).find(author => asArray(author.identifiers).includes(model['@id']));
        if( author ) item.rank = author['vivo:rank'];

        if( item.authorsCount && item.rank ) {
          // is person last author
          if( item.authorsCount === item.rank ) {
            model.lastCitation.push(item);
          }

          // is person top 20% rank in citation
          if( item.rank / item.authorsCount <= .2 ) {
            model.top20Citation.push(item);
          }
        }

        delete item.authors;
        return item;
      });
    }


    return model;
  }

  cleanObject(parent, attr) {
    if( parent === undefined ) return;
    let obj = parent[attr];
    if( obj === undefined ) return;

    if( Array.isArray(obj) ) {
      obj.forEach((o, i) => {
        if( typeof o === 'string') {
          obj[i] = {'@id': o};
        }
      });
    } else if( typeof obj === 'string' ) {
      parent[attr] = {'@id': obj}
    }
  }

}

function asArray(val) {
  if( !val ) return [];
  if( !Array.isArray(val) ) return [val];
  return val;
}

module.exports = new CleanModel();