# ========================
# 1) Builder Stage
# ========================
FROM node:18-bullseye as builder

WORKDIR /app

# Install and enable Corepack (gives us Yarn 4), no pinned local Yarn binary needed
RUN corepack enable && corepack prepare yarn@4.4.1 --activate

# Copy your entire repo into /app
COPY . . 

# (Optional logging, just to confirm a package exists)
RUN cat packages/app/package.json | grep prop-types
RUN cat yarn.lock | grep prop-types

# Install all dependencies (we rely on node_modules – NOT PnP)
# If you want a strict node_modules approach, set `nodeLinker: node-modules` in .yarnrc.yml
# or omit .yarnrc.yml entirely if you're comfortable with Yarn defaults.
RUN yarn install --immutable

# Build the backend (and optionally the frontend if needed)
RUN yarn tsc
RUN yarn build:backend


# ========================
# 2) Final (Runtime) Stage
# ========================
FROM node:18-bullseye

WORKDIR /app

# Again enable Corepack so we can run Yarn if needed (though strictly you may not need Yarn at runtime)
RUN corepack enable && corepack prepare yarn@4.4.1 --activate

# Copy just the build outputs (and package metadata if you want them)
COPY --from=builder /app/package.json /app/yarn.lock ./
COPY --from=builder /app/packages/backend/dist packages/backend/dist
COPY --from=builder /app/packages/app/dist packages/app/dist

ENV NODE_ENV=production
ENV PORT=7007
EXPOSE 7007

# Example entrypoint: expand the backend’s build bundle, then run
CMD ["sh", "-c", "tar -xzf packages/backend/dist/bundle.tar.gz && node packages/backend --config app-config.yaml --config app-config.production.yaml"]
