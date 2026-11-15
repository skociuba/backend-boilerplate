# node:18 nie starcza — Prisma 7.x wymaga Node 20.19+/22.12+/24+
FROM node:22-alpine

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

EXPOSE 3000

CMD ["npm", "run", "serve"]