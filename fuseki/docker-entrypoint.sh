#! /bin/bash

echo "here"
if [ -f "/fuseki/databases/vivo/tdb.lock" ] ; then
  echo "WARNING: fuseki lock file found.  removing."
  rm /fuseki/databases/vivo/tdb.lock
fi 
if [ -f "/fuseki/system/tdb.lock" ] ; then
  echo "WARNING: fuseki lock file found.  removing."
  rm /fuseki/system/tdb.lock
fi 

if [ ! -f "/jena-fuseki/extra" ] ; then
  cd /fuseki
  ln -s /jena-fuseki/extra .
  cd /
fi

exec /docker-entrypoint-org.sh "$@"