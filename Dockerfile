# NightDesk (production)
FROM node:22-slim AS deps
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@11.1.1 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .env* is intentionally NOT copied: configure env at runtime (see README).
RUN pnpm build

FROM node:22-slim AS run
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
