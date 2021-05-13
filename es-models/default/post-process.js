const fetch = require('node-fetch');

class PostProcess {

  async run(model, args, esSparqlModel) {
    if( model.pageStart ) model.pageStart = model.pageStart.replace(/\D*/g, '');
    if( model.pageEnd ) model.pageEnd = model.pageEnd.replace(/\D*/g, '');
    
    if( model.Authorship ) {
      this.cleanObject(model, 'Authorship');
      model.Authorship = this.dedupeAuthorship(model.Authorship);
    }

    this.cleanObject(model, 'hasSubjectArea');
    this.cleanObject(model, 'Journal');

    model._ = {};

    // author count
    if( model.citation ) {
      if( !Array.isArray(model.citation) ) {
        model.citation = [model.citation];
      }
      model._.top20Citation = [];
      model._.lastCitation = [];
      
      model.citation = model.citation.map(item => {
        item.authorsCount = asArray(item.authors).length;

        let author = asArray(item.authors).find(author => {
          return asArray(author.identifiers)
            .map(id => typeof id === 'string' ? id : id['@id'])
            .includes(model['@id'])
        });
        if( author ) item.rank = author['vivo:rank'];

        if( item.authorsCount && item.rank ) {
          // is person last author
          if( item.authorsCount === item.rank ) {
            model._.lastCitation.push(item);
          }

          // is person top 20% rank in citation
          if( item.rank / item.authorsCount <= .2 ) {
            model._.top20Citation.push(item);
          }
        }

        delete item.authors;
        return item;
      });
    }

    // for individual label indexing.
    if( model.label ) {
      model._[dashToCamel(args.modelType || 'default')+'Label'] = model.label;
    }

    // create the broader subjects index
    if( model.hasSubjectArea ) {
      model._.allSubjectArea = await this.getBroaderSubjectTerms(model.hasSubjectArea, esSparqlModel);
    }
    if( model.hasResearchArea ) {
      model._.allResearchArea = await this.getBroaderSubjectTerms(model.hasResearchArea, esSparqlModel);
    }

    return model;
  }

  async getBroaderSubjectTerms(terms, esSparqlModel) {
    if( !Array.isArray(terms) ) {
      terms = [terms];
    }

    let unique = new Set();
    for( let item of terms ) {   
      unique.add(item['@id']);

      let response = await esSparqlModel.getModel('concept', item['@id']);

      if( response && response.model && response.model.broader ) {
        await this.getBroaderSubjectTerms(response.model.broader, esSparqlModel);
      }
    }
    return Array.from(unique);
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

  /**
   * @method dedupeAuthorship
   * @description remove duplicate authors, this can happen based on elements having multiple
   * linked sources.  When removing dups, remove the one without rank.
   * 
   * @param {Array} arr 
   */
  dedupeAuthorship(arr) {
    if( arr === undefined ) return arr;
    if( !Array.isArray(arr) ) arr = [arr];

    let dups = [];
    arr.forEach((author, index) => {
      // create array of all ids for author
      let ids = [author['@id'], ... asArray(author.relates).map(item => item['@id']) ];

      //  see if any new author id is already in array of dups
      let exists = dups.findIndex(item => item.ids.some(id => ids.includes(id)));
      if( exists > -1 ) {
        // if so, we have a dup we need to sort out
        dups[exists].authors.push(author);
        ids.forEach(id => {
          if( !dups[exists].ids.includes(id) ) {
            dups[exists].ids.push(id);
          }
        });

        return;
      }

      // this is a first of it's kind author
      dups.push({authors: [author], index, ids});
    });
    arr = [];

    for( let item of dups ) {
      if( item.authors.length === 1 ) {
        arr.push(item.authors[0]);
        continue;
      }

      // if one has an author rank, keep it
      let rankAuthor = item.authors.find(author => author['vivo:rank'] !== undefined );
      if( rankAuthor ) {
        arr.push(rankAuthor);
        continue;
      }

      // use vcard
      rankAuthor = item.authors.find(author => author['@type'].includes('vcard:Individual'));
      if( rankAuthor ) {
        arr.push(rankAuthor);
        continue;
      }


      // otherwise just keep first
      arr.push(item.authors[0]);
    }

    return arr;
  }

}

function dashToCamel(str) {
  return str.replace(/-([a-z])/g, g => g[1].toUpperCase());
}

function asArray(val) {
  if( !val ) return [];
  if( !Array.isArray(val) ) return [val];
  return val;
}

module.exports = new PostProcess();