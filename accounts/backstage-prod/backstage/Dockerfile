    FROM node:18-bullseye as builder
    WORKDIR /app
    COPY . .
    RUN yarn install --immutable \
      && yarn tsc \
      && yarn build:backend
    
    FROM node:18-bullseye
    WORKDIR /app
    RUN corepack enable && corepack prepare yarn@4.4.1 --activate
    
    COPY . . 
    
    COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
    COPY --from=builder /app/packages/app/dist ./packages/app/dist
    
    RUN yarn workspaces focus --all --production
    
    ENV NODE_ENV=production
    ENV PORT=7007
    EXPOSE 7007
    
    CMD ["sh", "-c", "tar -xzf packages/backend/dist/bundle.tar.gz && node packages/backend --config app-config.yaml --config app-config.production.yaml"]
    