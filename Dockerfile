FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

RUN mkdir -p /app/data/uploads

ENV PORT=3840
ENV HOST=0.0.0.0
ENV NODE_ENV=production

EXPOSE 3840

CMD ["node", "server/index.js"]
