# Stage 1: Build
FROM node:20-alpine AS build

WORKDIR /app

# Copy package files and install all dependencies (including devDeps for tsc)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code and TypeScript config
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy compiled output from build stage
COPY --from=build /app/dist ./dist

# Copy registry files (loaded at startup)
COPY registry/ ./registry/

EXPOSE 8000

CMD ["node", "dist/index.js"]
