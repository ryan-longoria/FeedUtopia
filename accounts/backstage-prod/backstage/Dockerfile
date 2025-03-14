FROM node:18-bullseye

WORKDIR /app
RUN corepack enable && corepack prepare yarn@4.4.1 --activate

COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/app/dist ./packages/app/dist
COPY --from=builder /app/yarn.lock /app/package.json ./

RUN yarn install --production --frozen-lockfile

ENV NODE_ENV=production \
    PORT=7000

EXPOSE 7000
CMD ["node", "packages/backend/dist/index.js"]
