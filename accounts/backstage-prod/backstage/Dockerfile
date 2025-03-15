FROM node:18-bullseye as builder
WORKDIR /app

RUN corepack enable && corepack prepare yarn@4.4.1 --activate

COPY . .
RUN yarn install --immutable

RUN yarn tsc
RUN yarn build:backend

FROM node:18-bullseye
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules

COPY --from=builder /app/package.json /app/yarn.lock ./

COPY --from=builder /app/packages/backend/dist packages/backend/dist

COPY catalog/ ./catalog/
COPY app-config*.yaml ./


ENV NODE_ENV=production
ENV PORT=7007
EXPOSE 7007

CMD ["sh", "-c", "tar -xzf packages/backend/dist/bundle.tar.gz && node packages/backend --config app-config.yaml --config app-config.production.yaml"]