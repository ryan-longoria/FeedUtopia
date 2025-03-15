# ------------------------
# 1) Builder Stage
# ------------------------
    FROM node:18-bullseye as builder
    WORKDIR /app
    
    # Make sure to enable Corepack and prepare Yarn 4.4.1
    RUN corepack enable && corepack prepare yarn@4.4.1 --activate
    
    # Copy in your repo
    COPY . .
    
    # Now this 'yarn install' command will be Yarn 4.4.1 instead of Yarn 1.x
    RUN yarn install --immutable
    
    # Continue building
    RUN yarn tsc
    RUN yarn build:backend
    
    # ------------------------
    # 2) Final Stage
    # ------------------------
    FROM node:18-bullseye
    WORKDIR /app
    
    # Ensure we can use Yarn 4
    RUN corepack enable && corepack prepare yarn@4.4.1 --activate
    
    # Copy just the files needed for Yarn to see our workspaces:
    COPY --from=builder /app/package.json /app/yarn.lock ./
    COPY --from=builder /app/packages/backend/package.json /app/packages/backend/
    COPY --from=builder /app/packages/app/package.json /app/packages/app/
    # ...plus other packages you have. The goal is that Yarn sees them all.
    
    # Copy the built dist outputs from builder
    COPY --from=builder /app/packages/backend/dist packages/backend/dist
    COPY --from=builder /app/packages/app/dist packages/app/dist
    
    # Optionally copy config files if they’re not already in the repo root
    # COPY --from=builder /app/app-config.production.yaml ./
    
    # Now do a production-only install inside the final image:
    RUN yarn workspaces focus --all --production
    
    # (Optional) Debug check to see if @backstage/backend-defaults is installed
    RUN ls node_modules/@backstage && yarn why @backstage/backend-defaults || true
    
    ENV NODE_ENV=production
    ENV PORT=7007
    EXPOSE 7007
    
    CMD ["sh", "-c", "tar -xzf packages/backend/dist/bundle.tar.gz && node packages/backend --config app-config.yaml --config app-config.production.yaml"]
    