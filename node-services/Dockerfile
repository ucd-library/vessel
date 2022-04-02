FROM node:16

RUN mkdir /aggie-experts
WORKDIR /aggie-experts

COPY package.json .
COPY package-lock.json .
RUN npm install

RUN npm link
ENV NODE_PATH /usr/local/lib/node_modules/

RUN mkdir -p /etc/vessel
COPY default-models /etc/vessel/models

COPY services services
COPY lib lib