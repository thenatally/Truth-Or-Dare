FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

RUN npm run build
RUN npm run register
CMD ["npm", "start"]
