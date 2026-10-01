FROM node:22-alpine

WORKDIR /app

# ติดตั้ง dependencies ก่อน เพื่อใช้ layer cache
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

USER node
CMD ["node", "server.js"]
