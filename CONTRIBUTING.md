# Contributing

## Prerequisites (Windows)

1. **Node.js 20+** — Download from https://nodejs.org (LTS version). This gives you `node` and `npm`.

2. **Git** — Download from https://git-scm.com/download/win if you don't have it already.

3. **Windows Terminal** (recommended) — From the Microsoft Store. Makes life easier.

4. **(Optional) WSL2** — If you want to use the Makefile or run Linux commands:
   ```
   wsl --install
   ```
   Then open Ubuntu from the Start menu and follow the Linux setup below.

## Setup

```bash
# Clone the repo
git clone <repo-url>
cd hackathon

# Install all dependencies (this handles backend + both UIs)
npm install

# Build the backend
cd backend
npm run build
cd ..
```

## Running (Windows — no Make)

Open four terminals:

**Terminal 1 — Backend (port 8080):**
```bash
cd backend
npm run dev
```

**Terminal 2 — Verifier (port 8000):**
```bash
cd verifier
npx tsx src/index.ts
```

**Terminal 3 — Supplier UI (port 3001):**
```bash
cd supplier-ui
npx vite --port 3001
```

**Terminal 4 — Purchaser UI (port 3002):**
```bash
cd purchaser-ui
npx vite --port 3002
```

Then open:
- http://localhost:8000/health — Verifier health check
- http://localhost:8080/health — Backend health check
- http://localhost:3001 — Supplier interface
- http://localhost:3002 — Purchaser interface (click "Verify Chain" tab for demo)

## Running (WSL/Linux/Mac — with Make)

```bash
# Start all services
make dev

# Seed demo data (requires backend running)
make seed

# Stop all services
make stop

# Reset database and start fresh
make reset
```

That starts all three services with hot reload.

## Running Tests

```bash
# Backend tests
cd backend
npm test

# Verifier tests (167 tests)
cd verifier
npm test

# Run the scoring harness (verifier must be running on port 8000)
cd provenance-hackathon-main
python3 self_test.py http://localhost:8000/verify
```

## Project Structure

```
verifier/         → Scoring harness verifier (port 8000, POST /verify)
backend/          → Express API (TypeScript, SQLite, Ed25519 verification)
supplier-ui/      → React app for submitting signed attestations
purchaser-ui/     → React app for scanning QR codes, viewing provenance, and verifying chains
```

## What to Work On

Check `improvements.md` for a prioritized list of completed features and remaining improvements.

## How the API Works

The backend runs on port 8080. The verifier runs on port 8000. The frontend UIs proxy requests:
- `/api/*` → backend:8080 (strips `/api` prefix)
- `/verifier/*` → verifier:8000 (strips `/verifier` prefix)

Key backend endpoints:
- `POST /suppliers` — Register a supplier (name, publicKey, location)
- `POST /attestations` — Submit a signed attestation
- `GET /attestations/search?q=` — Search attestations
- `GET /products/:id/provenance` — Get full provenance report
- `GET /health` — Health check

Verifier endpoint (scoring harness):
- `POST /verify` — Verify an attestation chain (official format)
- `GET /health` — Health check

## Troubleshooting

**"better-sqlite3" build fails on Windows:**
You need Python and C++ build tools. Run in an admin PowerShell:
```
npm install -g windows-build-tools
```
Or install Visual Studio Build Tools with the "Desktop development with C++" workload.

**Port already in use:**
Kill whatever's on that port:
```bash
# Windows
netstat -ano | findstr :8080
taskkill /PID <pid> /F

# WSL/Linux
lsof -i :8080
kill <pid>
```

**npm install hangs or fails:**
Delete `node_modules` and `package-lock.json`, then retry:
```bash
rm -rf node_modules package-lock.json
npm install
```
