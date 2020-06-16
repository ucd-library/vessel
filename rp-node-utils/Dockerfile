FROM node:14

RUN mkdir /utils
WORKDIR /utils

COPY package.json .
COPY package-lock.json .

RUN npm install --production
RUN npm install -g

COPY index.js .