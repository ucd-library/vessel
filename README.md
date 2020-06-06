# vessel
Vivo + fusEki + elaStic Search; rEsearch profiLes

A proof-of-concept.

# Quick Start

  - Create ./.env file with the following:
    - FUSEKI_PASSWORD=[secret]
  - Make ./data directory in this repository
  - Copy over contents of Vivo Harvester `translated-records` (application/rdf+xml).  Keep `./data/publication`, `./data/user`, etc folder structure
  - `docker-compose up`
  - `docker-compose exec injest bash`
  - `node index.js`

This will scan and import all files from `./data`

## Changes

Feel free to edit/add/delete any file from `./data`.  You can then rerun `node index.js` to rescan folder.  Only modified files will be updated in Fuseki.  Or create a new script like the following to submit changes of single file.

```javascript

const scopedImport = require('./lib/scoped-import');
scopedImport.update({
  file : '/data/user/13847',
  source : 'elements',
  type : 'user'
});
```

# Process - What you will see

The injest works off of the (newly coined) notion of scoped imports, where all triples for a graph are scoped to a single file.  When the file changes, the ScopedImport class is able to make the proper changes in Fuseki.  More on this below.

The default script `index.js` will scan all directories in `./data`.  All scope imports have three things:
  - source: where the data came from
  - type: what type is the file.  Really a convenience for additionaly namespacing.  When using the default `index.js` sync script, the `type` is tied to the folder name.
  - filename: actual name of the file.

The ScopedImport class uses `https://experts.library.ucdavis.edu/scoped-import` graph.  When a file is found the scoped import graph is used to check if it has an entry for the file.  If not a simple insert is preformed.  If the scoped graph has a entry, the MD5 of the file is checked against the MD5 stored in the graph.  If they do not match a update is preformed.  Otherwise the file is ignored.

The scoped import graph contains the following (@context https://experts.library.ucdavis.edu/scoped-import/: si):
  - si:data - cache of file contents
  - si:md5 - md5 of file
  - si:type - scoped import file type (again; think namespace)
  - si:source - source (where the data came from) name for file (ex: elements)
  - si:filename - actual name of file
  - si:graph - graph data was added to
  - si:subject - all subjects tied to this file

On insert or update both the data graph and the scoped import graph are updated.  Additionally a message is sent to Kafka with the following structure:

```js
{
  data : {
    old : '[old file contents as triples]',
    new : '[new file contents as triples]'
  },
  fileUri: 'https://experts.library.ucdavis.edu/scoped-import/[source]/[type]/[filename]',
  subjects: ['Array of subjects stored in file']
}
```

As `index.js` runs, you will see ScopedImport class log it's decision to update or ignore files.  Additionally you will see a Kafka Consumer log messages that have been sent by the ScopedImport Kafka Producer when updates happen.

Currently data is added to the `https://experts.library.ucdavis.edu/individual` graph.

# Access

  - Fuseki UI: http://localhost:8080/
  - Kafka UI: http://localhost:9000/

# TODO

Add Elastic Search. Add real consumer (indexer) that listens to Kafka messages and reads in objects into elastic search based on spaql queries.  Add Node API layer (with swagger docs).