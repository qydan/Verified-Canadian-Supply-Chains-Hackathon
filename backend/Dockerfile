FROM node:20-slim

WORKDIR /app

# Install build dependencies for better-sqlite3 native module
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package.json ./

# Install all dependencies (need devDeps for build)
RUN npm install

# Copy source code and config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npx tsc

# Remove dev dependencies to slim down
RUN npm prune --production

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 8080

CMD ["node", "dist/index.js"]
