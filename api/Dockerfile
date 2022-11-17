ARG NODEJS_BASE
FROM ${NODEJS_BASE}

RUN mkdir /service
WORKDIR /service

COPY package.json .
COPY package-lock.json .

RUN npm install --production

COPY lib/new.json node_modules/@citation-js/plugin-ris/lib/spec/
COPY lib lib
COPY controllers controllers
COPY models models
COPY index.js .

CMD node index.js