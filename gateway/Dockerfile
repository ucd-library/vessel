ARG NODEJS_BASE
FROM ${NODEJS_BASE}

RUN mkdir /service
WORKDIR /service

COPY package.json .

RUN npm install --production

COPY controllers controllers
COPY lib lib
COPY index.js .

CMD node index.js