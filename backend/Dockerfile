FROM node:20-alpine
WORKDIR /app

# Prisma's query engine needs OpenSSL, which is not installed by default on Alpine.
RUN apk add --no-cache openssl

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production
RUN mkdir -p uploads/attachments uploads/imports uploads/templates

EXPOSE 4000

CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/server.js"]
