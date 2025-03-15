FROM node:18-bullseye as builder
WORKDIR /app
COPY . .
RUN yarn install --immutable && yarn tsc && yarn build:backend

FROM node:18-bullseye
WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.4.1 --activate
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/app/dist ./packages/app/dist
COPY --from=builder /app/yarn.lock /app/package.json ./
RUN yarn workspaces focus --all --production
ENV NODE_ENV=production \
    PORT=7007
EXPOSE 7007
CMD ["node", "packages/backend/dist/index.cjs.js"]

