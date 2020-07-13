const N3 = require('n3');

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