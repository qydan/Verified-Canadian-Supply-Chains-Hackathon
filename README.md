# Cryptographic Provenance for Canadian Supply Chains

A system that cryptographically verifies supply chain provenance and computes Canadian content percentages according to Competition Bureau guidelines. Built for the Canadian drone sector and defence procurement under the Buy Canadian Policy.

Suppliers submit digitally signed attestations that form a Directed Acyclic Graph (DAG) tracing materials from raw inputs through manufacturing to final products. Every claim is independently verifiable end-to-end.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Docker Compose                              │
│                                                                     │
│  ┌────────────────┐   ┌────────────────┐   ┌────────────────────┐   │
│  │  Supplier UI   │   │  Purchaser UI  │   │  Verification      │   │
│  │  :3001         │   │  :3002         │   │  Backend :8080     │   │
│  │                │   │                │   │                    │   │
│  │ • Register     │   │ • QR Scan      │   │ • Ed25519 verify   │   │
│  │ • Compose &    │   │ • Search       │   │ • SHA-256 hashing  │   │
│  │   sign attests │   │ • Provenance   │   │ • DAG traversal    │   │
│  │ • View history │   │   report       │   │ • Canadian %       │   │
│  │ • QR codes     │   │ • Map view     │   │ • 5 anomaly checks │   │
│  │                │   │ • PDF export   │   │ • SQLite storage   │   │
│  └───────┬────────┘   └───────┬────────┘   └────────┬───────────┘   │
│          │                    │                      │               │
│          │  POST /attestations         GET /products/:id/provenance  │
│          └────────────────────┴──────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Features

### Supplier Portal (:3001)
- **Supplier Registration** — Generate Ed25519 keypair, register with the system
- **Attestation Submission** — Compose, sign, and submit supply chain attestations
- **Submission History** — View past submissions, copy attestation IDs
- **QR Code Generation** — Each submission produces a scannable product QR code
- **Form Persistence** — Data preserved when switching between tabs

### Purchaser Portal (:3002)
- **QR Code Scanner** — Scan product QR codes with device camera
- **Manual Lookup** — Enter product UUID directly
- **Attestation Search** — Search by product name, country, or supplier
- **Provenance Report** with:
  - Canadian content designation banner (Product of Canada / Made in Canada / None)
  - Canadian content percentage with threshold gauge (51% / 98% markers)
  - Cost breakdown by country (pie chart)
  - Interactive supply chain world map with click-to-inspect
  - Chain of custody timeline (chronological)
  - Supply chain node visualization with verified supplier badges
  - Anomaly/integrity issue alerts
  - Product QR code for re-verification
- **PDF Export** — Print-optimized report with header, verification note, and footer

### Backend Verification Engine
- **Ed25519 Signature Verification** — Every attestation cryptographically verified
- **SHA-256 Content Hashing** — Tamper detection via content-addressed storage
- **DAG Traversal** — BFS ancestor chain walking with topological sort
- **Canadian Content Calculation** — Per Competition Bureau guidelines
- **5 Anomaly Detection Categories:**
  1. Integrity — Invalid signatures, modified payloads, unregistered suppliers
  2. Replay — Same attestation reused across different product chains
  3. Quantity — Consuming more material than was produced upstream
  4. Structural — Broken links, impossible temporal ordering, cycles
  5. Completeness — Missing required fields, negative costs, invalid country codes

## Quick Start

```bash
# Install dependencies
make install

# Start all services with hot reload
make dev

# Seed the database with demo drone supply chains
make seed
```

Services:
- **Backend API**: http://localhost:8080
- **Supplier UI**: http://localhost:3001
- **Purchaser UI**: http://localhost:3002

## Demo Data

The seed script creates 6 drone supply chains across 11 countries (CA, US, CN, DE, JP, KR, GB, IL, FR, IN, TW):

| Product | Steps | Countries | Designation |
|---------|-------|-----------|-------------|
| Maple Hawk ISR Drone | 10 | CA | Product of Canada |
| Maple Lifter Cargo Drone | 8 | CA, US, CN, DE | Made in Canada |
| SkyView Pro Consumer Drone | 7 | CN, TW, KR, US | None |
| Maple Guardian VTOL UAV | 12 | CA, US, GB, IL, FR, JP | Made in Canada |
| Maple Sprayer AG-600 | 6 | CA | Product of Canada |
| Maple Sentinel Maritime UAV | 9 | CA, GB, IN, KR, US | Made in Canada |

Product IDs for lookup:
```
a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d  (Product of Canada — Recon Drone)
b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e  (Made in Canada — Cargo Drone)
c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f  (None — Consumer Drone)
d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80  (Made in Canada — Defence VTOL)
e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091  (Product of Canada — Agri Drone)
f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f809102  (Made in Canada — Maritime Drone)
```

## Canadian Content Rules

| Designation | Criteria |
|---|---|
| **Product of Canada** | ≥98% Canadian costs + last transformation in Canada |
| **Made in Canada** | ≥51% Canadian costs + last transformation in Canada |
| **None** | Below thresholds or last transformation outside Canada |

Percentage = (sum of materialCost + labourCost where location = "CA") / (total materialCost + labourCost across all chain steps) × 100

## Make Commands

| Command | Description |
|---|---|
| `make dev` | Start all services with hot reload |
| `make seed` | Populate database with demo supply chains |
| `make test` | Run backend tests |
| `make stop` | Kill dev servers on ports 8080, 3001, 3002 |
| `make reset` | Stop servers and delete database |
| `make build` | Production build all services |
| `make docker` | Build and run with Docker Compose |
| `make docker-down` | Stop Docker Compose services |
| `make clean` | Remove build artifacts |

## API Endpoints

### Attestations
- `POST /attestations` — Submit a signed attestation
- `GET /attestations/search?q=` — Search attestations by name, country, or supplier
- `GET /attestations/:id` — Get a single attestation by ID

### Products
- `GET /products/:id/provenance` — Full provenance report

### Suppliers
- `POST /suppliers` — Register a supplier
- `GET /suppliers` — List all suppliers
- `GET /suppliers/:id` — Get supplier by ID

### Verification
- `POST /verify` — Verify an attestation chain by ID

### Health
- `GET /health` — Service health check

## Tech Stack

- **Backend**: TypeScript, Express, SQLite (better-sqlite3), tweetnacl (Ed25519), @noble/hashes (SHA-256)
- **Frontend**: React 18, Vite, TypeScript
- **Visualization**: recharts (pie charts), react-simple-maps (world map), qrcode.react
- **Scanning**: html5-qrcode (camera QR scanning)
- **Styling**: Custom CSS design system with Inter font, flag-icons
- **Testing**: Vitest, fast-check (property-based testing)
- **Deployment**: Docker Compose (nginx for frontends, Node.js for backend)

## Project Structure

```
├── backend/
│   └── src/
│       ├── crypto/          # Canonicalization, Ed25519, SHA-256
│       ├── engine/          # DAG traversal, topological sort, Canadian content
│       ├── anomaly/         # 5 anomaly detection categories
│       ├── routes/          # Express route handlers (attestations, products, suppliers, verify)
│       ├── database.ts      # SQLite schema and initialization
│       ├── server.ts        # Express app configuration
│       ├── types.ts         # TypeScript interfaces and enums
│       └── index.ts         # Entry point
├── supplier-ui/             # React app — supplier registration & attestation submission
│   └── src/
│       ├── App.tsx          # Main app with tab navigation
│       ├── AttestationForm.tsx
│       ├── SupplierRegistration.tsx
│       └── crypto.ts        # Client-side Ed25519 signing
├── purchaser-ui/            # React app — product verification & provenance reports
│   └── src/
│       ├── App.tsx          # Main app with scan/search/report tabs
│       ├── ProvenanceDisplay.tsx  # Full provenance report
│       ├── SupplyChainMap.tsx     # Interactive world map
│       ├── CostPieChart.tsx       # Cost by country pie chart
│       ├── ThresholdGauge.tsx     # 51%/98% threshold visualization
│       ├── ChainTimeline.tsx      # Chronological chain of custody
│       ├── SearchPage.tsx         # Attestation search
│       ├── QRScanner.tsx          # Camera QR code scanner
│       └── Flag.tsx               # Country flag component
├── scripts/
│   └── seed.ts             # Demo data seeder (6 drone chains, 18 suppliers)
├── docker-compose.yml
└── Makefile
```
