# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /repo

# prisma engines need openssl on alpine
RUN apk add --no-cache openssl

# install with the workspace-aware lockfile (cache-friendly layer order)
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @goodjob/api --include-workspace-root=false

COPY apps/api apps/api
RUN npm exec -w @goodjob/api -- prisma generate \
  && npm run build -w @goodjob/api
# compile the seed to plain JS so production (no ts-node) can run it
RUN cd apps/api && npx tsc prisma/seed.ts \
  --outDir seed-dist --module commonjs --target es2022 \
  --esModuleInterop --skipLibCheck

# ---------- production stage ----------
FROM node:20-alpine AS production
WORKDIR /repo
ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci -w @goodjob/api --omit=dev --include-workspace-root=false

# generated prisma client + CLI + engines come from the build stage so the
# production image never downloads engines at runtime
COPY --from=build /repo/apps/api/node_modules/.prisma apps/api/node_modules/.prisma
COPY --from=build /repo/apps/api/node_modules/@prisma apps/api/node_modules/@prisma
COPY --from=build /repo/apps/api/node_modules/prisma apps/api/node_modules/prisma

COPY apps/api/prisma apps/api/prisma
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/seed-dist apps/api/seed-dist

RUN mkdir -p /data/uploads && chown -R node:node /data/uploads /repo
USER node

WORKDIR /repo/apps/api
EXPOSE 3000
# apply pending migrations, optionally seed demo data (SEED_ON_BOOT=true,
# idempotent upserts), then start; prisma CLI is called by its entry file —
# node_modules/.bin symlinks are not copied
CMD ["sh", "-c", "node node_modules/prisma/build/index.js migrate deploy && { [ \"$SEED_ON_BOOT\" = \"true\" ] && node seed-dist/seed.js || true; } && node dist/main.js"]
