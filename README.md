# Cryptographic Provenance for Canadian Supply Chains

A system that cryptographically verifies supply chain provenance and computes Canadian content percentages according to Competition Bureau guidelines. Suppliers submit digitally signed attestations that form a Directed Acyclic Graph (DAG) tracing materials from raw inputs through manufacturing to final products.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Docker Compose                           │
│                                                                 │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────────┐     │
│  │ Supplier UI  │   │ Purchaser UI │   │ Verification     │     │
│  │ :3001        │   │ :3002        │   │ Backend :8080    │     │
│  │              │   │              │   │                  │     │ 
│  │ • Compose    │   │ • QR Scan    │   │ • Signature      │     │
│  │   attestation│   │ • View       │   │   verification   │     │
│  │ • Ed25519    │   │   provenance │   │ • DAG traversal  │     │
│  │   signing    │   │ • See        │   │ • Canadian %     │     │
│  │ • Submit     │   │   designation│   │ • Anomaly detect │     │
│  └──────┬───────┘   └──────┬───────┘   │ • SQLite DB      │     │
│         │                   │           └────────┬─────────┘    │
│         │   POST /attestations          GET /products/:id/      │
│         └───────────────────┴──────────── provenance ───────────┘
```

## How It Works

### 1. Suppliers Submit Attestations

A supplier fills out a form with:
- Product name, ID, and location (country code)
- Material cost and labour cost
- Output quantity and unit
- Whether this step is a transformation
- References to input attestations (upstream materials used)

The UI generates an Ed25519 keypair, signs the canonicalized payload, and submits it to the backend.

### 2. Backend Verifies and Stores

On receiving an attestation, the backend:
- Verifies the Ed25519 signature against the canonicalized payload
- Computes a SHA-256 content hash for tamper detection
- Checks for duplicates, cycles, and missing references
- Stores the attestation and flags any anomalies

### 3. Purchasers Query Provenance

A purchaser scans a product QR code (containing a product UUID). The backend:
- Walks the full ancestor chain via BFS
- Topologically sorts the chain (raw materials first)
- Verifies every signature in the chain
- Computes Canadian content percentage
- Determines designation (Product of Canada / Made in Canada / None)
- Runs anomaly detection across all 5 categories

### Canadian Content Rules

| Designation | Criteria |
|---|---|
| **Product of Canada** | ≥98% Canadian costs + last transformation in Canada |
| **Made in Canada** | ≥51% Canadian costs + last transformation in Canada |
| **None** | Below thresholds or last transformation outside Canada |

Percentage = (sum of materialCost + labourCost where location = "CA") / (total materialCost + labourCost across all chain steps) × 100

### Anomaly Detection (5 Categories)

1. **Integrity** — Invalid signatures, modified payloads, unregistered suppliers
2. **Replay** — Same attestation reused across different product chains
3. **Quantity** — Consuming more material than was produced upstream
4. **Structural** — Broken links, impossible temporal ordering, cycles
5. **Completeness** — Missing required fields, negative costs, invalid country codes

## Quick Start

```bash
# Install dependencies
make install

# Start all services with hot reload
make dev
```

Services:
- **Backend API**: http://localhost:8080
- **Supplier UI**: http://localhost:3001
- **Purchaser UI**: http://localhost:3002

## Make Commands

| Command | Description |
|---|---|
| `make dev` | Start all services with hot reload |
| `make test` | Run backend tests |
| `make build` | Production build all services |
| `make backend` | Start only the backend |
| `make supplier` | Start only the supplier UI |
| `make purchaser` | Start only the purchaser UI |
| `make docker` | Build and run with Docker Compose |
| `make clean` | Remove build artifacts |

## API Endpoints

### Attestations
- `POST /attestations` — Submit a signed attestation
- `GET /attestations/:id` — Get a single attestation

### Products
- `GET /products/:id/provenance` — Full provenance report with designation, percentage, chain, and issues

### Suppliers
- `POST /suppliers` — Register a supplier (name, publicKey, location)
- `GET /suppliers` — List all suppliers
- `GET /suppliers/:id` — Get a supplier by ID

### Verification
- `POST /verify` — Verify an attestation chain by ID

### Health
- `GET /health` — Returns `{ "status": "ok" }` when operational

## Tech Stack

- **Backend**: TypeScript, Express, SQLite (better-sqlite3), tweetnacl (Ed25519), @noble/hashes (SHA-256)
- **Frontend**: React, Vite, TypeScript
- **Purchaser UI**: html5-qrcode for QR scanning
- **Testing**: Vitest, fast-check (property-based testing)
- **Deployment**: Docker Compose (nginx for frontends, Node.js for backend)

## Project Structure

```
├── backend/
│   └── src/
│       ├── crypto/          # Canonicalization, signature verification
│       ├── engine/          # DAG traversal, topological sort, Canadian content
│       ├── anomaly/         # 5 anomaly detection categories
│       ├── routes/          # Express route handlers
│       ├── database.ts      # SQLite schema and initialization
│       ├── server.ts        # Express app configuration
│       ├── types.ts         # TypeScript interfaces and enums
│       └── index.ts         # Entry point
├── supplier-ui/             # React app for submitting attestations
├── purchaser-ui/            # React app for scanning QR codes and viewing provenance
├── docker-compose.yml
└── Makefile
```
