FROM node:20-alpine

# Install build dependencies for native sqlite3 module
RUN apk add --no-cache make g++ python3

WORKDIR /app

COPY server/gateway/package.json ./
RUN npm install --production

COPY server/gateway/gateway.js ./

EXPOSE 8000
EXPOSE 80

CMD ["node", "gateway.js"]
