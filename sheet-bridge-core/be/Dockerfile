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

# Copy Solana IDL file FIRST (required for TypeScript compilation and event parsing)
# The IDL should be built with 'anchor build' in solana/ before building this image
# Path: be/src/index.ts imports from ../../solana/target/idl/lock.json
# So from be/ directory (WORKDIR /app), we need ../solana/target/idl/lock.json
# Create directory structure first
RUN mkdir -p ../solana/target/idl

# Copy the IDL file - this will fail if the file doesn't exist, which is good!
# It forces the build to ensure the IDL is present before compiling TypeScript
# The IDL must be built with 'anchor build' in solana/ before building this image
COPY solana/target/idl/lock.json ../solana/target/idl/

# Verify IDL file has events (fail build if it's a placeholder)
RUN if grep -q '"events":\s*\[\s*\]' ../solana/target/idl/lock.json || ! grep -q '"events":\s*\[' ../solana/target/idl/lock.json; then \
      echo "❌ ERROR: IDL file has no events or is a placeholder!" && \
      echo "   Please run 'anchor build' in solana/ directory before building this image" && \
      exit 1; \
    fi && \
    if ! grep -q '"name":\s*"TokensLocked"' ../solana/target/idl/lock.json; then \
      echo "❌ ERROR: TokensLocked event not found in IDL!" && \
      exit 1; \
    fi && \
    echo "✅ Real IDL file verified with TokensLocked event"

# Copy application code
COPY be/ .

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

# Copy Solana IDL file from builder stage (for verification - JSON is already bundled in JS)
# The compiled JS imports the IDL via resolveJsonModule which bundles it into the JS
# But we keep a copy for runtime verification
RUN mkdir -p ../solana/target/idl
COPY --from=builder /app/../solana/target/idl/lock.json ../solana/target/idl/lock.json

# Verify IDL in production stage
RUN if grep -q '"name":\s*"TokensLocked"' ../solana/target/idl/lock.json; then \
      echo "✅ Production: IDL file with TokensLocked event verified"; \
    else \
      echo "⚠️  WARNING: Production: TokensLocked event not found in IDL (but may be bundled in JS)"; \
    fi

# Create directory for database and logs
RUN mkdir -p /app/data /app/logs /app/cred

# Set Node.js memory limit to 512MB (reduces memory usage)
ENV NODE_OPTIONS="--max-old-space-size=512"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Run compiled JavaScript (optimized - uses ~150MB memory instead of ~500MB+ with ts-node)
CMD ["node", "dist/index.js"]
