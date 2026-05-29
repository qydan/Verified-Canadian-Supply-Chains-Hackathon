.PHONY: install build start dev test clean backend supplier purchaser docker docker-down help seed

# Default target
help:
	@echo "Cryptographic Provenance - Canadian Supply Chains"
	@echo ""
	@echo "Usage:"
	@echo "  make install      Install all dependencies"
	@echo "  make build        Build all services"
	@echo "  make start        Start all services (background)"
	@echo "  make dev          Start all services in dev mode (foreground, with hot reload)"
	@echo "  make test         Run backend tests"
	@echo "  make backend      Start only the backend (port 8080)"
	@echo "  make supplier     Start only the supplier UI (port 3001)"
	@echo "  make purchaser    Start only the purchaser UI (port 3002)"
	@echo "  make docker       Build and start with Docker Compose"
	@echo "  make docker-down  Stop Docker Compose services"
	@echo "  make clean        Remove build artifacts"
	@echo ""

# Install all workspace dependencies from root
install:
	npm install

# Build all services
build: install
	cd backend && npm run build
	cd supplier-ui && npm run build
	cd purchaser-ui && npm run build

# Start all services in production mode (requires build first)
start: build
	@echo "Starting backend on :8080, supplier-ui on :3001, purchaser-ui on :3002"
	cd backend && npm start &
	cd supplier-ui && npx vite preview --port 3001 &
	cd purchaser-ui && npx vite preview --port 3002 &
	@echo "All services started. Press Ctrl+C to stop."
	@wait

# Start all services in dev mode with hot reload
dev: install
	@echo "Starting dev servers..."
	@echo "  Backend:      http://localhost:8080"
	@echo "  Supplier UI:  http://localhost:3001"
	@echo "  Purchaser UI: http://localhost:3002"
	@echo ""
	cd backend && npm run dev &
	cd supplier-ui && npx vite --port 3001 &
	cd purchaser-ui && npx vite --port 3002 &
	@wait

# Run backend tests
test:
	cd backend && npm test

# Individual services
backend: install
	cd backend && npm run build && npm start

supplier: install
	cd supplier-ui && npx vite --port 3001

purchaser: install
	cd purchaser-ui && npx vite --port 3002

# Docker
docker:
	docker compose up --build

docker-down:
	docker compose down

# Clean build artifacts
clean:
	rm -rf backend/dist
	rm -rf supplier-ui/dist
	rm -rf purchaser-ui/dist

# Seed the database with sample supply chain data
seed:
	npx tsx scripts/seed.ts
