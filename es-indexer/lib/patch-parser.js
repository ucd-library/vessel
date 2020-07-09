const N3 = require('n3');
const parser = new N3.Parser();

module.exports = (patch) => {
  patch = patch.split('\n')
    .filter(line => line.trim().match(/^(A|D) /))
    .map(line => line.replace(/^(A|D) /, ''))
    .join('\n');

  return parser.parse(patch);
}