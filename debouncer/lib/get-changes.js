/**
 * @function get-changes
 * @description extract all unique subjects and objects from parsed rdf
 * 
 * @param {Object} quads N3-quads object from n3 library
 * 
 * @returns {Object} subject:[types] key/value pair
 */
module.exports = quads => {
  let subjects = {};

  quads.forEach(quad => {
    if( quad.subject.constructor.name === 'NamedNode' ) {
      if( !subjects[quad.subject.id] ) subjects[quad.subject.id] = [];
    }
    if( quad.object.constructor.name === 'NamedNode' ) {
      if( !subjects[quad.object.id] ) subjects[quad.object.id] = [];
    }

    // append a type if in update
    // required lookup for cold start, when you can't query fuseki yet for types
    if( quad.predicate.id === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#type' ) {
      if( !subjects[quad.subject.id] ) subjects[quad.subject.id] = [];
      subjects[quad.subject.id].push(quad.object.id);
    }
  });

  return subjects;
}