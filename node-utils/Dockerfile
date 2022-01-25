FROM node:16

RUN mkdir /utils
WORKDIR /utils

COPY package.json .
COPY package-lock.json .
RUN npm install

RUN npm link
ENV NODE_PATH /usr/local/lib/node_modules/

COPY index.js .
COPY lib lib