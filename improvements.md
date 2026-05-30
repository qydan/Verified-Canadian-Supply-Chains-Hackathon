# Improvements & Status

## Completed

### Scoring Harness Verifier (port 8000) — AUTO-GRADED
- [x] `POST /verify` endpoint matching official contract exactly
- [x] Byte-exact canonical serializer (matches Python reference library)
- [x] Ed25519 signature verification (tweetnacl, base64)
- [x] SHA-256 content hashing (@noble/hashes)
- [x] DAG construction with Tarjan's SCC cycle detection
- [x] Canadian content percentage (flat sum, performed_in_country attribution)
- [x] Designation determination (BFS for last substantial transformation)
- [x] 10+ anomaly detection types:
  - [x] signature_invalid, signature_unknown_supplier
  - [x] parent_hash_mismatch
  - [x] anchor_mismatch, replay_cross_chain
  - [x] circular_reference, dangling_parent
  - [x] mass_balance_violation (global aggregation)
  - [x] unit_mismatch, timestamp_inversion
  - [x] replay_within_chain (duplicate IDs)
  - [x] cost_anomaly (labour rate cap)
  - [x] transformation_implausible (non-raw with no parents)
  - [x] statistical_anomaly (z-score: origin, timing, cost, labour)
- [x] 167 tests passing (unit + golden vector + integration)
- [x] Worked example passes (58.4%, made_in_canada, valid)
- [x] Self-test score: **96.6%** (9.66/10)
- [x] Docker Compose integration (port 8000, healthcheck)
- [x] Zero false positives on clean chains

### Core System (Backend)
- [x] Ed25519 signature verification on all attestations
- [x] SHA-256 content hashing for tamper detection
- [x] DAG traversal (BFS) with topological sort
- [x] Canadian content percentage calculation per Competition Bureau rules
- [x] Designation computation (Product of Canada / Made in Canada / None)
- [x] 5 anomaly detection categories (integrity, replay, quantity, structural, completeness)
- [x] 226 backend tests passing (including property-based testing with fast-check)

### Supplier Portal
- [x] Supplier registration with Ed25519 keypair generation
- [x] Sign-in flow for existing suppliers (with or without secret key)
- [x] Secret key shown once at registration (save-it-now UX)
- [x] Sign-in required to submit attestations
- [x] Attestation submission with client-side signing
- [x] Supplier dashboard (server-backed, shows all attestations across products)
- [x] Stats cards (attestation count, products, transformations, total value)
- [x] Form data persistence across tab switches
- [x] Form reset after successful submission
- [x] UUID validation on Product ID and input reference attestation IDs
- [x] QR code generation after submission

### Purchaser Portal
- [x] QR code scanning (camera-based)
- [x] Manual product ID lookup
- [x] Attestation search (by product name, country, supplier)
- [x] **Verify Chain page** — submit raw chain JSON to verifier, see results with DAG visualization
- [x] **Load Worked Example** button for demo (recovery drone chain)
- [x] Provenance report with:
  - [x] Designation banner (color-coded)
  - [x] Canadian content percentage
  - [x] Threshold gauge (51% / 98% markers with current position)
  - [x] Cost breakdown progress bar (Canadian vs non-Canadian)
  - [x] Cost by country pie chart (recharts)
  - [x] Product info with QR code
  - [x] Interactive world map with click-to-inspect popups
  - [x] Chain of custody timeline (chronological)
  - [x] DAG-style supply chain visualization (layered, flow-diagram layout)
  - [x] Per-node: output quantity, cost, consumption progress bar
  - [x] Cost per tier summary
  - [x] Anomaly/integrity issue alerts
  - [x] Verified supplier badges
- [x] PDF/print export with professional report layout
- [x] Country flags via flag-icons CSS library (Windows compatible)

### Seed Data & Demo
- [x] 6 clean drone supply chains (52 attestations, 18 suppliers, 11 countries)
- [x] 2 anomaly chains (replay attack + quantity exceeded)
- [x] Chains span: CA, US, CN, DE, JP, KR, GB, IL, FR, IN, TW
- [x] Products: ISR drone, cargo drone, consumer drone, defence VTOL, agri sprayer, maritime patrol

### DevOps & DX
- [x] Docker Compose deployment
- [x] Makefile commands: dev, seed, test, stop, reset, build, docker
- [x] Modern CSS design system (Inter font, custom properties, responsive)
- [x] React StrictMode compatibility (no double-fetch bugs)

## Remaining / Future Improvements

### High Priority (if time permits during hackathon)
- [ ] Attestation detail modal — click a chain node to see full crypto details (signature, hash, timestamp)
- [ ] Shareable report URLs — deep link to `/report/:productId` so reports can be bookmarked/shared
- [ ] Chain completeness indicator — show if all input references are resolved vs. partial chain
- [ ] Better error messages — map backend error codes to human-friendly explanations in the UI

### Medium Priority
- [ ] NATO/Five Eyes country highlighting on the map (defence context)
- [ ] Supplier verification tiers (Registered → Verified → Trusted) — visual only
- [ ] Dark mode toggle
- [ ] Staggered chain node animations (appear one by one)
- [ ] Batch attestation import (CSV/JSON upload for bulk data entry)
- [ ] Supplier activity log / audit trail with timestamps

### Polish & Production Readiness
- [ ] Skeleton loaders instead of spinners
- [ ] Better mobile layout for the map
- [ ] Keyboard shortcuts (Ctrl+P for export)
- [ ] Accessibility audit (ARIA labels, focus management, screen reader testing)
- [ ] Performance: code-split recharts and react-simple-maps (lazy load)
- [ ] E2E tests with Playwright
- [ ] PostgreSQL migration path (for production scalability)
- [ ] Hardware security module (HSM) integration for key storage
- [ ] Key rotation / revocation mechanism
- [ ] Rate limiting and authentication on API endpoints
