ARG NODEJS_BASE
FROM ${NODEJS_BASE}

RUN mkdir /service
WORKDIR /service

COPY package.json .

RUN npm install --production

COPY controller.js .
COPY index.js .

CMD node index.js