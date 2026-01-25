FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock* ./

# Install dependencies
# Try npm ci first (fastest), fallback to npm install if lock file is out of sync, then try yarn
RUN npm ci --omit=dev || npm install --omit=dev || yarn install --frozen-lockfile --production

# Copy application code
COPY . .

# Create directory for credentials if needed
RUN mkdir -p /app/cred

# Expose port
EXPOSE 8545

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8545/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start the server
CMD ["npm", "start"]
