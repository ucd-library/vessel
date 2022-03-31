const fetch = require('node-fetch');

class PostProcess {

  async run(model, args, esSparqlModel) {
    // JM - removing page cleanup
    // if( model.pageStart ) model.pageStart = model.pageStart.replace(/\D*/g, '');
    // if( model.pageEnd ) model.pageEnd = model.pageEnd.replace(/\D*/g, '');


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

        let citations = dedupCitation(item.authors);

        let author = citations.find(author => {
          return asArray(author.identifiers)
            .map(id => typeof id === 'string' ? id : id['@id'])
            .includes(model['@id'])
        });
        if( author ) item.rank = author.rank;

        if( item.authorsCount && item.rank ) {
          // is person last author
          if( item.authorsCount === item.rank ) {
            model._.lastCitation.push(item);
          }

          // is person top 20% rank in citation, top 2 authors up to 10
          if( item.rank / item.authorsCount <= .2 || (item.rank <= 2 && item.authorsCount <= 10) ) {
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

    if( model.gcsMetadata ) {
      try {
        model._.gcsMetadata = JSON.parse(model.gcsMetadata);
      } catch(e) {}
      delete model.gcsMetadata; 
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
        let additionalTerms = await this.getBroaderSubjectTerms(response.model.broader, esSparqlModel);
        additionalTerms.forEach(term => term ? unique.add(term) : '');
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

function getIdentifier(item) {
  if( typeof item === 'string' ) return item;
  if( typeof item === 'object' && item['@id'] ) return item['@id'];
  return '';
}

function simpleCitationObject(item) {
  return {
    '@id' : getIdentifier(item),
    rank : item['vivo:rank'] || item.rank,
    identifiers : asArray(item.identifiers).map(getIdentifier)
  }
}

function dedupCitation(citations) {
  citations = asArray(citations).map(simpleCitationObject)
  citations = citations.filter(item => {
    let entries = citations.filter(citation => {
      return citation.identifiers.some(id => item.identifiers.includes(id))
    });
    if( entries.length === 1 ) return true;

    // pick best
    return (item.rank !== undefined) ? true : false;
  });
  return citations;
}

module.exports = new PostProcess();
