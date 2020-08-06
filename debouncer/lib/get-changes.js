/**
 * @function get-changes
 * @description extract all unique subjects and objects from parsed rdf
 * 
 * @param {Object} quads N3-quads object from n3 library
 * 
 * @returns {Array}
 */
module.exports = quads => {
  let subjects = {};

  quads.forEach(quad => {
    if( quad.subject.constructor.name === 'NamedNode' ) {
      subjects[quad.subject.id] = true;
    }
    if( quad.object.constructor.name === 'NamedNode' ) {
      subjects[quad.object.id] = true;
    }
  });

  return Object.keys(subjects);
}