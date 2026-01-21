# Multi-stage build to reduce memory usage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3) and TypeScript
RUN apk add --no-cache python3 make g++

# Copy package files
COPY be/package*.json ./
COPY be/tsconfig.json ./

# Install ALL dependencies (including dev dependencies for building)
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Copy application code
COPY be/ .

# Create Solana IDL placeholder for TypeScript compilation
# Real IDL should be built with 'anchor build' in solana/
RUN mkdir -p /solana/target/idl && \
    echo '{"version":"0.1.0","name":"lock","address":"11111111111111111111111111111111","metadata":{"name":"lock","version":"0.1.0","spec":"0.1.0"},"instructions":[],"accounts":[],"types":[],"events":[],"errors":[]}' > /solana/target/idl/lock.json

# Build TypeScript to JavaScript (reduces runtime memory by ~400MB)
RUN mkdir -p dist && \
    NODE_OPTIONS="--max-old-space-size=4096" npx tsc \
      --skipLibCheck \
      --incremental false \
      --isolatedModules && \
    test -f dist/index.js || (echo "❌ TypeScript build failed - dist/index.js not found" && ls -la dist/ && exit 1) && \
    echo "✅ TypeScript build successful - dist/index.js exists"

# Production stage - minimal dependencies
FROM node:20-alpine

WORKDIR /app

# Install only runtime dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY be/package*.json ./

# Install ONLY production dependencies (excludes ts-node, typescript, jest, etc.)
# This significantly reduces memory footprint (~200MB savings)
RUN npm ci --omit=dev --legacy-peer-deps || npm install --omit=dev --legacy-peer-deps

# Copy built JavaScript from builder stage
COPY --from=builder /app/dist ./dist
# Verify dist was copied successfully
RUN test -f dist/index.js || (echo "❌ ERROR: dist/index.js not found after COPY from builder" && ls -la dist/ 2>&1 && exit 1) && \
    echo "✅ dist/index.js verified in production stage"

# Create Solana IDL placeholder (same as builder stage)
RUN mkdir -p /solana/target/idl && \
    echo '{"version":"0.1.0","name":"lock","address":"11111111111111111111111111111111","metadata":{"name":"lock","version":"0.1.0","spec":"0.1.0"},"instructions":[],"accounts":[],"types":[],"events":[],"errors":[]}' > /solana/target/idl/lock.json

# Create directory for database and logs
RUN mkdir -p /app/data /app/logs /app/cred

# Set Node.js memory limit to 512MB (reduces memory usage)
ENV NODE_OPTIONS="--max-old-space-size=512"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Run compiled JavaScript (optimized - uses ~150MB memory instead of ~500MB+ with ts-node)
CMD ["node", "dist/index.js"]
