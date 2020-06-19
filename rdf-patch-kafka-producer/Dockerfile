FROM ucdlib/rp-v-node-utils:local

RUN mkdir /service
WORKDIR /service

COPY package.json .
COPY package-lock.json .

RUN npm install --production

COPY index.js .

CMD bash -c "tail -f /dev/null"