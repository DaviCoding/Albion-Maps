# Build stage
FROM node:24-alpine AS builder

WORKDIR /app

ENV NODE_ENV=development

RUN corepack enable

RUN for i in 1 2 3; do apk add --no-cache python3 make g++ && break || sleep 5; done

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY prisma ./prisma
RUN pnpm prisma generate

COPY . .
RUN pnpm build


# Production stage
FROM node:24-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

RUN corepack enable

RUN apk add --no-cache libstdc++

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

COPY prisma ./prisma
RUN pnpm prisma generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/argon2 ./node_modules/argon2

EXPOSE 1000

CMD ["node", "dist/server.js"]