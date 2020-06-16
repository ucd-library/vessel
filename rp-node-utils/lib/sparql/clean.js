
class CleanModel {

  run(model) {
    if( model.pageStart ) model.pageStart = model.pageStart.replace(/\D*/g, '');
    if( model.pageEnd ) model.pageEnd = model.pageEnd.replace(/\D*/g, '');

    this.cleanObject(model, 'Authorship');
    this.cleanObject(model, 'hasSubjectArea');
    this.cleanObject(model, 'Journal');

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

module.exports = new CleanModel();