#! /bin/bash

if [ -f "/fuseki/databases/vivo/tdb.lock" ] ; then
  echo "WARNING: fuseki lock file found.  removing."
  rm /fuseki/databases/vivo/tdb.lock
fi 
if [ -f "/fuseki/system/tdb.lock" ] ; then
  echo "WARNING: fuseki lock file found.  removing."
  rm /fuseki/system/tdb.lock
fi 

exec /docker-entrypoint-org.sh "$@"