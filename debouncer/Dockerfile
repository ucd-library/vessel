FROM ucdlib/rp-v-node-utils:local

RUN mkdir /service
WORKDIR /service

COPY package.json .
COPY package-lock.json .

RUN npm install --production

# COPY lib lib
COPY index.js .

CMD node index.js