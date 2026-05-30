# Presentation Brief — Cryptographic Provenance for Canadian Supply Chains

**Format:** 5 minutes presentation (hard cut-off) + 2 minutes Q&A
**Team:** [Your team name]
**Challenge:** Ottawa Defence Hackathon — AVSS Cryptographic Provenance

---

## Judging Criteria & How We Address Each

### 1. Entrepreneurial Drive (10 points)
*"Initiative, problem understanding, and execution mindset: leadership, proactiveness, and the ability to translate ideas into actionable outcomes."*

**Key points to convey:**
- We identified that "Buy Canadian" procurement fraud costs Canadian taxpayers and undermines defence supply chain integrity
- We didn't just build a verifier — we built a complete ecosystem: supplier issuance, purchaser verification, and automated scoring
- We went beyond the spec: implemented statistical anomaly detection that catches attacks the spec doesn't name
- We used the training corpus analytically to derive z-score thresholds for detecting economically implausible claims
- Proactive approach: built 14 anomaly detection types when the spec only names ~8 examples
- Execution: 167 automated tests, 96.6% self-test score, zero false positives on clean chains

**Demo evidence:** Show the full system working end-to-end — supplier signs, purchaser verifies, attacks detected

---

### 2. Algorithm Approach (5 points)
*"Logic, methodology, and structure of the algorithmic solution: originality, efficiency, clarity of design, and appropriateness of the chosen approach."*

**Key points to convey:**

**Architecture:**
- Stateless verification pipeline: Parse → Build DAG → Verify Signatures → Verify Hashes → Check Integrity → Compute Percentage → Determine Designation → Return
- All checks run independently (no short-circuiting) — one failure doesn't mask others
- Tarjan's SCC algorithm for cycle detection (not naive DFS)
- BFS from leaf for "last substantial transformation" (closest qualifying node)
- Global aggregation for mass balance (not per-edge — catches diamond DAG attacks)

**Statistical Detection (original contribution):**
- Extracted distributions from 705 clean training chains
- Per-action-type z-score thresholds calibrated to the exact maximum observed in clean data (zero false positives)
- 4 statistical checks: origin outlier (supplier country mismatch), timing outlier (suspiciously short production gaps), labour outlier (hours beyond normal for action type), cost outlier (implied rate anomaly)
- Per-action-type timing thresholds (component_manufacture: 29h, others: 24h)

**Canonical Serialization (hardest technical problem):**
- Custom JSON serializer matching Python reference byte-for-byte
- Cannot use JSON.stringify (escapes non-ASCII as \uXXXX)
- Handles: key sorting at every nesting level, whole floats as integers, no trailing zeros, raw UTF-8 passthrough
- Validated against golden vectors from reference library

**Efficiency:**
- O(n) per chain for all checks (n = number of attestations)
- Registries loaded once at startup, cached in memory
- Worst case: ~800ms for 65-attestation chain (well within 10s timeout)

---

### 3. Technical Implementation (10 points)
*"Your automated harness score, scaled to 10 points."*

**Key points to convey:**
- **Self-test score: 96.6% → 9.66/10 points**
- 100% on ALL rule-based attack categories (13 categories)
- 100% on clean chains (zero false positives — critical for F1 scoring)
- Statistical detection catches 61% of timing outliers, 75% of labour outliers, 95% of origin outliers
- 167 automated tests (unit, integration, golden vector, worked example)
- Byte-exact canonical serialization verified against Python reference
- Worked example: 58.4%, made_in_canada, chain_valid=true, anomalies=[] ✓

**Anomaly types detected (14 total):**
| Layer | Types |
|-------|-------|
| Cryptographic | signature_invalid, signature_unknown_supplier, parent_hash_mismatch, anchor_mismatch |
| Structural | circular_reference, dangling_parent |
| Integrity | mass_balance_violation, unit_mismatch, timestamp_inversion, replay_cross_chain, replay_within_chain |
| Semantic | cost_anomaly, transformation_implausible |
| Statistical | statistical_anomaly (origin, timing, cost, labour z-scores) |

---

### 4. Feasibility & Scalability (5 points)
*"Practicality of real-world implementation: operational viability, scalability potential, and resource considerations."*

**Key points to convey:**

**Production-ready design decisions:**
- Stateless verifier — horizontally scalable behind a load balancer
- No database dependency for verification (registries in memory)
- Docker Compose deployment — one command to run
- Separate services: verifier can scale independently of the application backend
- Registry files bundled in container image — no external dependencies at runtime

**Real-world deployment path:**
- Replace static registry files with a real-time anchor service (blockchain or append-only log)
- Add HSM (Hardware Security Module) integration for key storage
- Supplier reputation scoring based on historical verification results
- Integration with procurement systems (SAP, Oracle) via API
- Key rotation and revocation mechanisms
- Rate limiting and authentication for production API

**Scalability characteristics:**
- O(n) verification per chain — linear in attestation count
- Memory: ~5MB for 3147 anchor entries + 69 supplier keys
- Throughput: ~3 chains/second on single core (1000 chains in ~5.5 min)
- Stateless = can run N replicas with no coordination

**Defence/government context:**
- Ed25519 signatures provide non-repudiation
- Hash-linked DAG creates tamper-evident audit trail
- Anchor registry acts as immutable public ledger
- All verification is deterministic and reproducible (legally defensible)

---

### 5. Storytelling & Vision (3 points)
*"Clarity, persuasiveness, and strategic vision in the presentation."*

**Narrative arc:**

**The Problem (30s):**
"Canada's Buy Canadian policy is built on trust. Suppliers self-report their Canadian content. There's no way to verify these claims after the fact. A single fraudulent attestation can cascade through an entire supply chain, inflating Canadian content percentages and winning contracts under false pretenses. In defence procurement, this isn't just a financial issue — it's a national security concern."

**The Solution (30s):**
"We built a cryptographic provenance system. Every supplier contribution is an Ed25519 signed attestation. Attestations link via SHA-256 content hashes into a tamper-evident DAG. Any modification — to costs, country, quantities — breaks the hash chain and is immediately detectable. Even with stolen keys, our statistical detection catches economically implausible claims."

**The Vision (30s):**
"Imagine scanning a QR code on a military drone and seeing, cryptographically verified, that 58% of its value was created in Canada — with every step traceable to a specific supplier, timestamp, and location. That's what we built. In production, this integrates with procurement systems, provides real-time verification, and creates a legally defensible audit trail that survives supply chain disputes."

---

## Live Demo Script (90 seconds)

1. **Supplier UI** (20s): "Here a supplier registers their Ed25519 keypair and signs an attestation — materials, labour, location. This produces a node in the chain."

2. **Purchaser UI — Verify Chain** (40s): 
   - Click "Verify Chain" tab
   - Click "Load Worked Example — Recovery Drone"
   - Click "Verify Chain"
   - "This recovery drone has 12 attestations across 6 countries. 58.4% Canadian content, Made in Canada designation, chain is cryptographically valid. You can see the supply chain DAG — green nodes are Canadian steps."

3. **Attack Detection** (30s):
   - Modify a cost value in the JSON
   - Re-verify
   - "Now we've tampered with one attestation. The signature immediately fails. Even if an attacker re-signs with a stolen key, our statistical detector would flag the implausible cost pattern."

---

## Q&A Preparation

**"How do you handle the fact that all private keys are available?"**
Valid signatures prove a message wasn't garbled, not that the claim is true. We layer detection: hash-link integrity catches content modification, anchor registry catches rewritten attestations, and statistical z-scores catch economically implausible claims even when correctly signed.

**"What's your false positive rate?"**
Zero on the 705 clean training chains. We calibrated every threshold to sit just above the maximum observed in legitimate data. F1 scoring penalizes over-flagging, so precision was our priority.

**"How would this scale to millions of attestations?"**
The verifier is stateless and O(n) per chain. In production you'd add: a distributed anchor registry, caching layer for frequently-verified chains, and horizontal scaling behind a load balancer. The core algorithm doesn't change.

**"What attacks can't you detect?"**
Attacks where the perturbed values fall within the normal distribution of clean chains. Our z-score approach catches ~60-95% of statistical outliers depending on the type. The remaining cases would require more training data or ensemble methods.

**"Why z-scores instead of a trained model?"**
Only 124 statistical attack cases in training — too few for ML without overfitting. Z-scores are interpretable, explainable to auditors, and provably have zero false positives on the training distribution. For a defence/government context, explainability matters.

---

## System Stats (for slides)

- **Self-test score:** 96.6% (9.66/10)
- **Anomaly types detected:** 14
- **Automated tests:** 167
- **False positives on clean chains:** 0
- **Worked example:** ✓ (58.4%, made_in_canada, valid)
- **Response time:** <1s per chain
- **Languages:** TypeScript (verifier + backend), React (UIs)
- **Crypto:** Ed25519 (tweetnacl), SHA-256 (@noble/hashes)
- **Services:** 4 (verifier, backend, supplier UI, purchaser UI)
- **Deployment:** Docker Compose, single command
