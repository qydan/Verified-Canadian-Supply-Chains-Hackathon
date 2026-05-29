# Improvements & Status

## Completed

- [x] Seed data with realistic multi-tier drone supply chains (6 chains, 18 suppliers, 11 countries)
- [x] Modern UI redesign (CSS design system, Inter font, gradients, cards, animations)
- [x] Supply chain world map visualization with click-to-inspect popups
- [x] Cost breakdown pie chart by country (recharts)
- [x] Designation threshold gauge (51% / 98% visual markers)
- [x] Chain of custody timeline (chronological view)
- [x] Attestation search (by product name, country, supplier)
- [x] PDF/print export with professional report layout
- [x] Verified supplier badges on chain nodes
- [x] QR code generation (supplier UI after submission + purchaser report)
- [x] QR code scanning (camera-based, purchaser UI)
- [x] Supplier registration with persistent Ed25519 keypair
- [x] Submission history with copy-to-clipboard
- [x] Form data persistence across tab switches
- [x] Form reset after successful submission
- [x] Country flags via flag-icons CSS library (Windows compatible)
- [x] Mobile-responsive design
- [x] Fix: React StrictMode fetch race condition (fetchId pattern)
- [x] Fix: QR scanner double image
- [x] Fix: Signature mismatch (currency field alignment)
- [x] Fix: Makefile stop/reset commands

## Potential Further Improvements

### High Impact
- [ ] Anomaly demo chain — seed a 7th chain that intentionally triggers replay/quantity anomalies
- [ ] Supplier dashboard — view all attestations by a specific supplier across products
- [ ] Chain completeness indicator — show if all input references are resolved
- [ ] NATO/Five Eyes country highlighting on the map
- [ ] Real-time anomaly toast notifications after submission

### Medium Impact
- [ ] Dark mode toggle
- [ ] Staggered chain node animations (appear one by one)
- [ ] Shareable report URLs (deep link to product ID)
- [ ] Attestation detail modal (click a chain node to see full details)
- [ ] Supplier activity log / audit trail
- [ ] Batch attestation import (CSV/JSON upload)

### Polish
- [ ] Skeleton loaders instead of spinners
- [ ] Better mobile QR scanner (full viewport)
- [ ] Keyboard shortcuts (Ctrl+P for export, etc.)
- [ ] Accessibility audit (ARIA labels, focus management)
- [ ] Performance: code-split recharts and react-simple-maps (lazy load)
- [ ] E2E tests with Playwright
