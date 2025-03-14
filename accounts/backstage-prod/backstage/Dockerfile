FROM node:18-bullseye as builder
WORKDIR /app

COPY . .
RUN yarn install --immutable && yarn build

FROM node:18-bullseye
WORKDIR /app

COPY --from=builder /app/packages/backend/build ./packages/backend/build
COPY --from=builder /app/packages/app/build ./packages/app/build
COPY --from=builder /app/yarn.lock /app/package.json ./

RUN yarn install --production --frozen-lockfile

ENV NODE_ENV=production \
    PORT=7000

EXPOSE 7000
CMD ["node", "packages/backend/build/index.js"]
