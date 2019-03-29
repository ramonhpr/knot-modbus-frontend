FROM node:10

RUN apt install -y libdbus-1 dbus

WORKDIR /usr/src/app
COPY package.json ./
COPY yarn.lock ./
RUN yarn

COPY . .
RUN yarn build

EXPOSE 80

ENV NODE_ENV=production
ENV API_PORT=80
CMD ["yarn", "start:server"]
