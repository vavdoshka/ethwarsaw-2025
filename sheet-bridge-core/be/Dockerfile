FROM node:20-alpine

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including dev dependencies for ts-node)
RUN npm ci || npm install

# Copy application code
COPY . .

# Create directory for database and logs
RUN mkdir -p /app/data /app/logs

# Create directory for credentials if needed
RUN mkdir -p /app/cred

# Build TypeScript (optional - we can use ts-node at runtime)
# RUN npm run build

# Expose port (if the service exposes one, adjust as needed)
# EXPOSE 3000

# Health check (adjust based on actual health endpoint if available)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "process.exit(0)" || exit 1

# Start the service using ts-node
CMD ["npm", "run", "dev"]
