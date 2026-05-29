# Build stage
FROM node:20-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY tsconfig.json tsconfig.app.json ./
COPY index.html ./
COPY src/ ./src/

RUN npx tsc -b && npx vite build

# Serve stage
FROM nginx:alpine

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3002

CMD ["nginx", "-g", "daemon off;"]
