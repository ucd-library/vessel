const fs = require('fs');
const path = require('path');

let schemaTxt = fs.readFileSync(path.join(__dirname, 'es-vivo-schema.json'));
let vivo = JSON.parse(schemaTxt, 'utf-8');

const config = {
  // this needs to be assigned on instantiation
  // index: newIndexName,
  body : {
    settings : {
      analysis : {
        analyzer: {
          // default is a special keyword which overrides the normal
          // default analyzer for text indexing
          default: {
            tokenizer: 'standard',
            filter: ["lowercase", "stop", "asciifolding"]
          },
        },
        char_filter: {
          first_letter_filter: {
            type: "pattern_replace",
            pattern: "(.).*",
            replacement: "$1"
          }
        },
        normalizer: {
          first_letter_normalizer: {
            type: "custom",
            char_filter: ["first_letter_filter"],
            filter: [
              "lowercase"
            ]
          },
          keyword_lowercase: {
            type: "custom",
            filter: ["lowercase"]
          }
        },
        tokenizer: {}
      }
    },
    mappings : vivo
  }
}

module.exports = config;