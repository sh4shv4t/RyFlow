FROM node:20-alpine

WORKDIR /app

# Install build deps for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++ \
    curl sqlite-libs

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev

# Rebuild native modules for this platform
RUN npm rebuild better-sqlite3

COPY . .

# Create data directory
RUN mkdir -p /app/data/workspaces

EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s \
  --start-period=20s --retries=5 \
  CMD curl -f http://localhost:3001/api/health || exit 1

CMD ["node", "index.js"]
