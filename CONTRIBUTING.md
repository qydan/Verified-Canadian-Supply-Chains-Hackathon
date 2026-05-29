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

Open three terminals:

**Terminal 1 — Backend (port 8080):**
```bash
cd backend
npm run dev
```

**Terminal 2 — Supplier UI (port 3001):**
```bash
cd supplier-ui
npx vite --port 3001
```

**Terminal 3 — Purchaser UI (port 3002):**
```bash
cd purchaser-ui
npx vite --port 3002
```

Then open:
- http://localhost:8080/health — should show `{"status":"ok"}`
- http://localhost:3001 — Supplier interface
- http://localhost:3002 — Purchaser interface

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
cd backend
npm test
```

## Project Structure

```
backend/          → Express API (TypeScript, SQLite, Ed25519 verification)
supplier-ui/      → React app for submitting signed attestations
purchaser-ui/     → React app for scanning QR codes and viewing provenance
```

## What to Work On

Check `improvements.md` for a prioritized list of completed features and remaining improvements.

## How the API Works

The backend runs on port 8080. The frontend UIs proxy `/api/*` requests to it (Vite strips the `/api` prefix).

Key endpoints:
- `POST /suppliers` — Register a supplier (name, publicKey, location)
- `POST /attestations` — Submit a signed attestation
- `GET /attestations/search?q=` — Search attestations
- `GET /products/:id/provenance` — Get full provenance report
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
