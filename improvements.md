# Hackathon Improvements & Presentation Ideas

## High Impact (Do These First)

### 1. Seed Data / Demo Script

Right now the system starts empty. Create a `make seed` command that populates a realistic multi-tier Canadian supply chain so judges can immediately see the system working without manually entering data.

Example scenario:
- Raw lumber supplier (CA) → Sawmill (CA) → Furniture manufacturer (CA) → Retailer
- Some inputs from US/CN to show mixed content
- One chain that hits "Product of Canada" (≥98%)
- One chain that hits "Made in Canada" (51-97%)
- One chain that gets "None"
- One chain with an anomaly (quantity exceeded, replay detected)

This makes the demo instant and proves all features work end-to-end.

---

### 2. Supply Chain Graph Visualization (Purchaser UI)

The current chain display is a flat vertical list with arrows. Replace it with a proper DAG visualization:

- Use a library like `dagre` + SVG or `react-flow` to render nodes and edges
- Nodes show: product name, location flag emoji (🇨🇦 🇺🇸 etc.), cost
- Edges show: quantity consumed and unit
- Color-code nodes: green for Canadian, grey for non-Canadian, red for anomalies
- Highlight the critical path (most expensive route)

This is the single most visually impressive thing for a demo.

---

### 3. Dashboard / Summary View

Add a landing page to the purchaser UI (or a separate admin view) showing:

- Total attestations in the system
- Breakdown by designation (pie chart: Product of Canada / Made in Canada / None)
- Recent anomalies detected (live feed style)
- Top suppliers by volume

Use a simple charting library like `recharts` (lightweight, React-native).

---

### 4. Better Designation Display

The current designation banner is good but could be more impactful:

- Add a large circular gauge showing the percentage (like a speedometer)
- Show the threshold lines at 51% and 98% on the gauge
- Animate the gauge filling up when the report loads
- Add the Canadian flag / maple leaf SVG for "Product of Canada"

---

## Medium Impact

### 5. QR Code Generation (Supplier UI)

After a supplier submits an attestation, generate a QR code containing the product ID that they can print/share. This closes the loop — supplier submits → gets QR → purchaser scans QR → sees provenance.

Use `qrcode.react` or similar. Display it right in the success message after submission.

---

### 6. Submission History (Supplier UI)

The "Submission History" page is currently a placeholder. Implement it:

- Store submissions in localStorage (or query the backend)
- Show a table: product name, product ID, timestamp, content hash, status
- Allow clicking a row to see the full attestation details
- Add a "Copy ID" button for easy reference when creating downstream attestations

---

### 7. Real-time Anomaly Alerts

Add a notification/toast system that shows when anomalies are detected:

- After submitting an attestation, if issues come back, show them as dismissible toasts
- Color-code by severity (red for CRITICAL, yellow for WARNING)
- Include a "View Details" link that expands the issue

---

### 8. Improved Error Messages

Map backend error codes to human-friendly messages:

| Backend Error | User-Friendly Message |
|---|---|
| `INVALID_SIGNATURE` | "The signature doesn't match the payload. Was the data modified after signing?" |
| `UNREGISTERED_SUPPLIER` | "This signing key isn't registered. Register as a supplier first." |
| `QUANTITY_EXCEEDS_UPSTREAM` | "You're claiming more material than was produced upstream." |
| `REPLAY_DETECTED` | "This input is already used in a different product chain." |
| `BROKEN_LINK` | "One of your input references doesn't exist in the system." |

---

### 9. Supplier Registration Flow

Currently there's no UI for registering suppliers. Add a simple registration page:

- Name, location (country dropdown)
- Auto-generate keypair and display the public key
- Submit to POST /suppliers
- Show confirmation with supplier ID
- Store the keypair in localStorage for future submissions (so the same supplier can submit multiple attestations with a consistent identity)

This also fixes the "UNREGISTERED_SUPPLIER" issue that currently fires on every submission since the UI generates a new keypair each time.

---

### 10. Mobile-Responsive Design

The purchaser UI is meant for scanning QR codes at point of purchase (phone). Make it mobile-first:

- Larger touch targets
- Full-width layout on small screens
- Camera scanner takes up most of the viewport
- Designation banner is huge and readable from arm's length

---

## Polish & Presentation

### 11. Loading States & Animations

- Add skeleton loaders instead of spinners
- Animate the supply chain nodes appearing one by one (staggered fade-in)
- Smooth transitions between pages
- Progress bar during attestation submission

---

### 12. Branding & Visual Identity

- Pick a consistent color palette (currently using generic dark blue)
- Add a logo (maple leaf + chain link icon)
- Use a proper font (Inter or similar)
- Add subtle gradients to the header
- Consider a light/dark mode toggle

---

### 13. Export / Share Provenance Report

Add a "Download PDF" or "Share Link" button on the provenance report:

- Generate a shareable URL with the product ID
- Or export as a simple PDF with the designation, percentage, and chain summary
- Useful for procurement teams who need to document compliance

---

### 14. Presentation Talking Points

For the demo, structure it as:

1. **Problem** (30s): "How do you know a product is actually Canadian? Current system is paper-based and easy to forge."
2. **Solution** (30s): "Cryptographic attestations forming a verifiable supply chain graph."
3. **Live Demo** (2min):
   - Show seed data already loaded
   - Scan a QR code → see "Product of Canada" with full chain
   - Show an anomaly being detected (submit a bad attestation)
   - Show the graph visualization
4. **Technical depth** (1min): "Ed25519 signatures, content-addressed hashing, DAG traversal, 5 anomaly detection categories, property-based testing"
5. **Impact** (30s): "Applicable to any supply chain compliance — not just Canadian content"

---

## Quick Wins (< 30 min each)

- [ ] Add favicon and page titles to both UIs
- [ ] Add `make seed` with a script that curls the API with sample data
- [ ] Add country flag emojis next to location codes in the chain display
- [ ] Show cost breakdown (material vs labour) in the provenance report
- [ ] Add a "Copy to clipboard" button for attestation IDs
- [ ] Add timestamps to the chain nodes (show when each step happened)
- [ ] Add a count badge showing number of issues on the nav bar
