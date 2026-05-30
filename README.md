# Cryptographic Provenance for Canadian Supply Chains

A system that cryptographically verifies supply chain provenance and computes Canadian content percentages according to Competition Bureau guidelines. Built for the Canadian drone sector and defence procurement under the Buy Canadian Policy.

Suppliers submit digitally signed attestations that form a Directed Acyclic Graph (DAG) tracing materials from raw inputs through manufacturing to final products. Every claim is independently verifiable end-to-end.

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              Docker Compose                                   │
│                                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │  Supplier UI   │  │  Purchaser UI  │  │   Backend    │  │  Verifier   │  │
│  │  :3001         │  │  :3002         │  │   :8080      │  │  :8000      │  │
│  │                │  │                │  │              │  │             │  │
│  │ • Register     │  │ • QR Scan      │  │ • SQLite DB  │  │ • Stateless │  │
│  │ • Compose &    │  │ • Search       │  │ • CRUD APIs  │  │ • Ed25519   │  │
│  │   sign attests │  │ • Provenance   │  │ • Anomaly    │  │ • SHA-256   │  │
│  │ • View history │  │   report       │  │   detection  │  │ • 10 checks │  │
│  │ • QR codes     │  │ • Verify Chain │  │ • Supplier   │  │ • Z-score   │  │
│  │                │  │ • Map view     │  │   registry   │  │   detection │  │
│  └───────┬────────┘  └──┬─────────┬──┘  └──────┬───────┘  └──────┬──────┘  │
│          │              │         │             │                  │         │
│          │   POST /api/*│         │ POST /verifier/verify          │         │
│          └──────────────┴─────────┴─────────────┴──────────────────┘         │
└──────────────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Scoring Harness Verifier (:8000) — `POST /verify`
The auto-graded component. A standalone stateless service that:
- Accepts attestation chains in the official scoring format
- Validates Ed25519 signatures against the supplier registry
- Verifies parent content hashes (SHA-256 of canonical serialization)
- Detects 10+ anomaly types (structural, cryptographic, semantic, statistical)
- Computes Canadian content percentage and designation
- Returns results in the exact official response format
- **Self-test score: 96.6% (9.66/10)**

### Supplier Portal (:3001)
- **Supplier Registration** — Generate Ed25519 keypair, register with the system
- **Attestation Submission** — Compose, sign, and submit supply chain attestations
- **Submission History** — View past submissions, copy attestation IDs
- **QR Code Generation** — Each submission produces a scannable product QR code

### Purchaser Portal (:3002)
- **QR Code Scanner** — Scan product QR codes with device camera
- **Manual Lookup** — Enter product UUID directly
- **Attestation Search** — Search by product name, country, or supplier
- **Verify Chain** — Submit raw attestation chain JSON to the verifier and see results with DAG visualization
- **Provenance Report** with:
  - Canadian content designation banner
  - Percentage with threshold gauge (51% / 98% markers)
  - Cost breakdown by country (pie chart)
  - Interactive supply chain world map
  - Chain of custody timeline
  - Supply chain DAG visualization with country-colored nodes
  - Anomaly/integrity issue alerts

## Quick Start

```bash
# Install dependencies
make install

# Start all services with hot reload (backend + verifier + UIs)
make dev

# Seed the database with demo drone supply chains
make seed
```

Services:
- **Verifier (scoring)**: http://localhost:8000
- **Backend API**: http://localhost:8080
- **Supplier UI**: http://localhost:3001
- **Purchaser UI**: http://localhost:3002

## Running the Self-Test

```bash
# Start the verifier
make verifier

# In another terminal, run the scoring harness
cd provenance-hackathon-main
python3 self_test.py http://localhost:8000/verify
```

## Docker Compose

```bash
# Build and start everything
docker compose up --build

# The verifier serves POST /verify on port 8000
# The scoring harness can hit it directly
```

## Anomaly Detection

The verifier detects the following anomaly types:

| Category | Anomaly Type | Description |
|----------|-------------|-------------|
| Cryptographic | `signature_invalid` | Ed25519 signature doesn't verify |
| Cryptographic | `signature_unknown_supplier` | Supplier not in registry |
| Cryptographic | `parent_hash_mismatch` | Parent content hash doesn't match |
| Cryptographic | `anchor_mismatch` | Content differs from anchor registry |
| Structural | `circular_reference` | Cycle in the DAG |
| Structural | `dangling_parent` | Parent reference not in chain |
| Integrity | `mass_balance_violation` | Over-consumption of outputs |
| Integrity | `unit_mismatch` | Child consumes in wrong unit |
| Integrity | `timestamp_inversion` | Parent timestamp after child |
| Integrity | `replay_cross_chain` | Attestation reused across products |
| Semantic | `replay_within_chain` | Duplicate attestation_id in submission |
| Semantic | `cost_anomaly` | Labour rate outside normal band |
| Semantic | `transformation_implausible` | Non-raw step with no parents |
| Statistical | `statistical_anomaly` | Z-score outlier (origin, timing, cost, labour) |

## Canadian Content Rules

| Designation | Criteria |
|---|---|
| **Product of Canada** | ≥98% Canadian costs + last substantial transformation in Canada |
| **Made in Canada** | ≥51% Canadian costs + last substantial transformation in Canada |
| **None** | Below thresholds or last transformation outside Canada |

- Cost = `material_cad + labour_cost_cad` per attestation
- Attribution by `performed_in_country` (not supplier's registered country)
- Substantial transformation = `action_type ∈ {component_manufacture, subassembly, final_integration}` AND `labour_hours ≥ 4`
- Last ST = closest qualifying node to the product leaf (BFS)

## Make Commands

| Command | Description |
|---|---|
| `make dev` | Start all services (backend, verifier, UIs) with hot reload |
| `make verifier` | Start only the verifier on port 8000 |
| `make test` | Run backend tests |
| `make test-verify` | Run verifier tests (167 tests) |
| `make seed` | Populate database with demo supply chains |
| `make stop` | Kill dev servers on ports 8080, 8000, 3001, 3002 |
| `make reset` | Stop servers and delete database |
| `make build` | Production build all services |
| `make docker` | Build and run with Docker Compose |
| `make docker-down` | Stop Docker Compose services |
| `make clean` | Remove build artifacts |

## Project Structure

```
├── verifier/                    # Scoring harness verifier (port 8000)
│   └── src/
│       ├── canonical.ts         # Byte-exact canonical serializer (matches Python reference)
│       ├── dag.ts               # DAG construction with Tarjan's SCC cycle detection
│       ├── verify.ts            # Main orchestrator pipeline
│       ├── checks/
│       │   ├── signature.ts     # Ed25519 signature verification
│       │   ├── hash.ts          # Parent content hash verification
│       │   ├── mass-balance.ts  # Global over-consumption detection
│       │   ├── unit.ts          # Unit mismatch detection
│       │   ├── timestamp.ts     # Temporal inversion detection
│       │   ├── anchor.ts        # Anchor registry checks
│       │   ├── semantic.ts      # Duplicate IDs, implausible transforms, cost caps
│       │   └── statistical.ts   # Z-score anomaly detection (origin, timing, cost, labour)
│       ├── compute/
│       │   ├── canadian-content.ts  # Flat-sum percentage calculation
│       │   └── designation.ts       # BFS for last substantial transformation
│       ├── registry.ts          # Load supplier keys + anchor registry
│       ├── parse.ts             # Zod request validation
│       ├── server.ts            # Express app factory
│       └── types.ts             # TypeScript interfaces
├── backend/                     # Application backend (port 8080)
│   └── src/
│       ├── crypto/              # Canonicalization, Ed25519, SHA-256
│       ├── engine/              # DAG traversal, topological sort, Canadian content
│       ├── anomaly/             # 5 anomaly detection categories
│       ├── routes/              # Express route handlers
│       ├── database.ts          # SQLite schema
│       └── types.ts             # TypeScript interfaces
├── supplier-ui/                 # React app — supplier portal (port 3001)
├── purchaser-ui/                # React app — purchaser portal (port 3002)
│   └── src/
│       ├── App.tsx              # Main app with scan/search/report/verify tabs
│       ├── VerifyChainPage.tsx  # Chain verification with DAG visualization
│       ├── ProvenanceDisplay.tsx
│       ├── SupplyChainMap.tsx
│       └── ...
├── docker-compose.yml           # All 4 services
├── Makefile                     # Dev commands
└── provenance-hackathon-main/   # Challenge starter kit (reference lib, registries, training data)
```

## Tech Stack

- **Verifier**: TypeScript, Express, tweetnacl (Ed25519), @noble/hashes (SHA-256), Zod
- **Backend**: TypeScript, Express, SQLite (better-sqlite3), tweetnacl, @noble/hashes
- **Frontend**: React 18, Vite, TypeScript, recharts, react-simple-maps, qrcode.react
- **Testing**: Vitest (167 verifier tests), fast-check (property-based)
- **Deployment**: Docker Compose (nginx for frontends, Node.js for services)
