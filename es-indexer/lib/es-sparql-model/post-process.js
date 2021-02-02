const fetch = require('node-fetch');

class PostProcess {

  async run(model, args) {
    if( model.pageStart ) model.pageStart = model.pageStart.replace(/\D*/g, '');
    if( model.pageEnd ) model.pageEnd = model.pageEnd.replace(/\D*/g, '');

    this.cleanObject(model, 'Authorship');
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

        let author = asArray(item.authors).find(author => asArray(author.identifiers).includes(model['@id']));
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
      model._.allSubjectArea = await this.getBroaderSubjectTerms(model.hasSubjectArea);
    }
    if( model.hasResearchArea ) {
      model._.allResearchArea = await this.getBroaderSubjectTerms(model.hasResearchArea);
    }

    return model;
  }

  async getBroaderSubjectTerms(terms) {
    if( !Array.isArray(terms) ) {
      terms = [terms];
    }

    let unique = new Set();
    for( let item of terms ) {
      try {
        let response = await fetch('http://api:3000/api/subject-terms/broader/'+encodeURIComponent(item['@id']));
        let results = await response.json();
        results.forEach(item => unique.add(item['@id']));
      } catch(e) {
        console.warn('Failed to fetch broader subject terms: '+item['@id']);
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