const N3 = require('n3');
const parser = new N3.Parser({format: 'N-Quads'});

/**
 * @function patch-parser
 * @description parse rdf-path message, which is a little bit of syntactic sugar
 * around the N-Quads format so N3 node library is used.
 * 
 * @param {String} patch raw patch from kafka-fuseki-connector
 * 
 * @returns {Object}
 */
module.exports = (patch) => {
  let lines = [];

  // combine multi line statements
  patch.split('\n').forEach(line => {
    if( line.match(/^[A-Z]: /) ) {
      lines.push(line);
      return;
    }

    if( !lines.length ) return;
    lines[lines.length-1] += line;
  });

  patch = lines
    .filter(line => line.trim().match(/^(A|D): /) ? true : false)
    .map(line => line.replace(/^(A|D): /, ''))
    .join('\n');

  return parser.parse(patch);
}