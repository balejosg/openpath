FROM node:20-alpine AS builder

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache python3 make g++

# Copy root package files
COPY package*.json ./
COPY tsconfig.base.json ./
COPY api/package*.json ./api/
COPY shared/package*.json ./shared/
COPY dashboard/package*.json ./dashboard/

# Install dependencies
RUN npm ci

# Copy source code
COPY api ./api
COPY shared ./shared
COPY dashboard ./dashboard

# Build shared first
RUN cd shared && npm run build

# Build API (dashboard depends on api types)
WORKDIR /app/api
RUN npm run build
WORKDIR /app

# Build Dashboard
RUN cd dashboard && npm run build

# -----------------------------------------------------------------------------
# Production Stage
# -----------------------------------------------------------------------------
FROM node:20-alpine

WORKDIR /app

# Install system utils
RUN apk add --no-cache dumb-init

# Copy package files
COPY package*.json ./
COPY api/package*.json ./api/
COPY shared/package*.json ./shared/
COPY dashboard/package*.json ./dashboard/

# Install production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy built artifacts
COPY --from=builder /app/api/dist ./api/dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/dashboard/dist ./dashboard/dist

# Create user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 -G nodejs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

ENTRYPOINT ["dumb-init", "--"]

WORKDIR /app/dashboard
CMD ["node", "dist/index.js"]
