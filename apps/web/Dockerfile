# ---------- build stage ----------
FROM node:20-alpine AS build
WORKDIR /repo

# where the browser reaches the API (baked into the static bundle)
ARG VITE_API_URL=http://localhost:3000

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
RUN npm ci -w @goodjob/web --include-workspace-root=false

COPY apps/web apps/web
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build -w @goodjob/web

# ---------- production stage: static files behind nginx ----------
FROM nginx:1.27-alpine AS production
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
