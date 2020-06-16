#! /bin/bash

ORG=ucdlib
PREFIX=rp-v-
TAG=local

# Use buildkit to speedup local builds
# Not supported in google cloud build yet
if [[ -z $CLOUD_BUILD ]]; then
  export DOCKER_BUILDKIT=1
fi

docker build \
  -t "${ORG}/${PREFIX}node-utils:${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  ./rp-node-utils

docker build \
  -t "${ORG}/${PREFIX}es-indexer:${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  ./es-indexer

docker build \
  -t "${ORG}/${PREFIX}fuseki-proxy:${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  ./fuseki-proxy

docker build \
  -t "${ORG}/${PREFIX}fuseki-backend:${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  ./fuseki-backend

docker build \
  -t "${ORG}/${PREFIX}fuseki-injest:${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  ./fuseki-injest

docker build \
  -t "${ORG}/${PREFIX}api:${TAG}" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  ./api