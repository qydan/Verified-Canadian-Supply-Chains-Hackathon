/**
 * Seed script: populates a realistic multi-tier Canadian supply chain.
 *
 * Run with: npx tsx scripts/seed.ts
 *
 * Requires the backend to be running at http://localhost:8080
 */

import nacl from 'tweetnacl';

const API_BASE = 'http://localhost:8080';

// ============================================================================
// Helpers
// ============================================================================

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function deepSortKeys(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(deepSortKeys);
  if (typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    const keys = Object.keys(value as Record<string, unknown>).sort();
    for (const key of keys) {
      sorted[key] = deepSortKeys((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

function canonicalize(obj: unknown): Uint8Array {
  const sorted = deepSortKeys(obj);
  const json = JSON.stringify(sorted);
  return new TextEncoder().encode(json);
}

// ============================================================================
// Supplier definitions
// ============================================================================

interface SupplierDef {
  name: string;
  location: string;
  keyPair: nacl.SignKeyPair;
}

const suppliers: SupplierDef[] = [
  { name: 'Northern Timber Co.', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Maple Resin Ltd.', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Pacific Assembly Inc.', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'US Steel Supply', location: 'US', keyPair: nacl.sign.keyPair() },
  { name: 'Shenzhen Electronics', location: 'CN', keyPair: nacl.sign.keyPair() },
];

// ============================================================================
// API helpers
// ============================================================================

async function registerSupplier(supplier: SupplierDef): Promise<string> {
  const pubKeyHex = bytesToHex(supplier.keyPair.publicKey);

  const res = await fetch(`${API_BASE}/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: supplier.name,
      publicKey: pubKeyHex,
      location: supplier.location,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to register supplier "${supplier.name}": ${res.status} ${body}`);
  }

  const data = await res.json();
  console.log(`  ✓ Registered supplier: ${supplier.name} (${supplier.location}) → ${data.id}`);
  return data.id;
}

interface AttestationPayload {
  productName: string;
  productId: string;
  supplierId: string;
  location: string;
  materialCost: number;
  labourCost: number;
  currency: string;
  outputQuantity: number;
  outputUnit: string;
  timestamp: string;
  isTransformation: boolean;
  inputs: Array<{ attestationId: string; quantityUsed: number; unit: string }>;
}

async function submitAttestation(
  supplier: SupplierDef,
  supplierId: string,
  payload: AttestationPayload,
): Promise<{ id: string; contentHash: string }> {
  const message = canonicalize(payload);
  const sig = nacl.sign.detached(message, supplier.keyPair.secretKey);
  const sigHex = bytesToHex(sig);
  const pubKeyHex = bytesToHex(supplier.keyPair.publicKey);

  const res = await fetch(`${API_BASE}/attestations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      payload,
      signature: sigHex,
      publicKey: pubKeyHex,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to submit attestation for "${payload.productName}": ${res.status} ${body}`);
  }

  const data = await res.json();
  console.log(`  ✓ Attestation: ${payload.productName} (${payload.location}) → ${data.id}`);
  return { id: data.id, contentHash: data.contentHash };
}

// ============================================================================
// Main seed logic
// ============================================================================

async function main() {
  console.log('🌱 Seeding supply chain data...\n');

  // --- Register all suppliers ---
  console.log('📋 Registering suppliers...');
  const supplierIds: string[] = [];
  for (const s of suppliers) {
    const id = await registerSupplier(s);
    supplierIds.push(id);
  }
  console.log('');

  const [northernTimber, mapleResin, pacificAssembly, usSteel, shenzhenElectronics] = suppliers;
  const [northernTimberId, mapleResinId, pacificAssemblyId, usSteelId, shenzhenElectronicsId] = supplierIds;

  // Use proper UUIDs for product IDs (purchaser UI validates UUID format)
  const productOfCanadaId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const madeInCanadaId = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
  const noneDesignationId = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';

  // =========================================================================
  // Chain 1: "Product of Canada" (≥98% CA costs, last transform in CA)
  // All steps are Canadian
  // =========================================================================
  console.log('🍁 Chain 1: Product of Canada (≥98% CA costs)');

  const timber = await submitAttestation(northernTimber, northernTimberId, {
    productName: 'Canadian Hardwood Lumber',
    productId: productOfCanadaId,
    supplierId: northernTimberId,
    location: 'CA',
    materialCost: 200,
    labourCost: 100,
    currency: 'CAD',
    outputQuantity: 50,
    outputUnit: 'kg',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    isTransformation: false,
    inputs: [],
  });

  const resin = await submitAttestation(mapleResin, mapleResinId, {
    productName: 'Canadian Wood Finish',
    productId: productOfCanadaId,
    supplierId: mapleResinId,
    location: 'CA',
    materialCost: 80,
    labourCost: 40,
    currency: 'CAD',
    outputQuantity: 10,
    outputUnit: 'L',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    isTransformation: false,
    inputs: [],
  });

  await submitAttestation(pacificAssembly, pacificAssemblyId, {
    productName: 'Handcrafted Maple Furniture',
    productId: productOfCanadaId,
    supplierId: pacificAssemblyId,
    location: 'CA',
    materialCost: 50,
    labourCost: 300,
    currency: 'CAD',
    outputQuantity: 1,
    outputUnit: 'units',
    timestamp: new Date(Date.now() - 86400000).toISOString(),
    isTransformation: true,
    inputs: [
      { attestationId: timber.id, quantityUsed: 30, unit: 'kg' },
      { attestationId: resin.id, quantityUsed: 2, unit: 'L' },
    ],
  });

  console.log('');

  // =========================================================================
  // Chain 2: "Made in Canada" (51-97% CA costs, last transform in CA)
  // Mix of CA and US inputs, assembled in CA
  // =========================================================================
  console.log('🏭 Chain 2: Made in Canada (51-97% CA costs)');

  const caWood = await submitAttestation(northernTimber, northernTimberId, {
    productName: 'Canadian Pine Boards',
    productId: madeInCanadaId,
    supplierId: northernTimberId,
    location: 'CA',
    materialCost: 150,
    labourCost: 60,
    currency: 'CAD',
    outputQuantity: 40,
    outputUnit: 'kg',
    timestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
    isTransformation: false,
    inputs: [],
  });

  const usHardware = await submitAttestation(usSteel, usSteelId, {
    productName: 'Steel Brackets & Hardware',
    productId: madeInCanadaId,
    supplierId: usSteelId,
    location: 'US',
    materialCost: 120,
    labourCost: 30,
    currency: 'CAD',
    outputQuantity: 20,
    outputUnit: 'units',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    isTransformation: false,
    inputs: [],
  });

  await submitAttestation(pacificAssembly, pacificAssemblyId, {
    productName: 'Hybrid Dining Table',
    productId: madeInCanadaId,
    supplierId: pacificAssemblyId,
    location: 'CA',
    materialCost: 30,
    labourCost: 200,
    currency: 'CAD',
    outputQuantity: 1,
    outputUnit: 'units',
    timestamp: new Date(Date.now() - 86400000 * 2).toISOString(),
    isTransformation: true,
    inputs: [
      { attestationId: caWood.id, quantityUsed: 35, unit: 'kg' },
      { attestationId: usHardware.id, quantityUsed: 10, unit: 'units' },
    ],
  });

  console.log('');

  // =========================================================================
  // Chain 3: "None" designation (mostly non-CA)
  // Chinese electronics with minimal CA involvement
  // =========================================================================
  console.log('❌ Chain 3: No Canadian Designation (mostly non-CA)');

  const cnBoard = await submitAttestation(shenzhenElectronics, shenzhenElectronicsId, {
    productName: 'Circuit Board Assembly',
    productId: noneDesignationId,
    supplierId: shenzhenElectronicsId,
    location: 'CN',
    materialCost: 300,
    labourCost: 100,
    currency: 'CAD',
    outputQuantity: 100,
    outputUnit: 'units',
    timestamp: new Date(Date.now() - 86400000 * 5).toISOString(),
    isTransformation: true,
    inputs: [],
  });

  const cnCasing = await submitAttestation(shenzhenElectronics, shenzhenElectronicsId, {
    productName: 'Plastic Enclosure',
    productId: noneDesignationId,
    supplierId: shenzhenElectronicsId,
    location: 'CN',
    materialCost: 80,
    labourCost: 20,
    currency: 'CAD',
    outputQuantity: 100,
    outputUnit: 'units',
    timestamp: new Date(Date.now() - 86400000 * 4).toISOString(),
    isTransformation: false,
    inputs: [],
  });

  await submitAttestation(shenzhenElectronics, shenzhenElectronicsId, {
    productName: 'Consumer Electronics Gadget',
    productId: noneDesignationId,
    supplierId: shenzhenElectronicsId,
    location: 'CN',
    materialCost: 50,
    labourCost: 30,
    currency: 'CAD',
    outputQuantity: 50,
    outputUnit: 'units',
    timestamp: new Date(Date.now() - 86400000 * 3).toISOString(),
    isTransformation: true,
    inputs: [
      { attestationId: cnBoard.id, quantityUsed: 50, unit: 'units' },
      { attestationId: cnCasing.id, quantityUsed: 50, unit: 'units' },
    ],
  });

  console.log('');
  console.log('✅ Seed complete!');
  console.log('');
  console.log('Product IDs for provenance lookup:');
  console.log(`  Product of Canada: ${productOfCanadaId}`);
  console.log(`  Made in Canada:    ${madeInCanadaId}`);
  console.log(`  None:              ${noneDesignationId}`);
  console.log('');
  console.log('Paste any of these into the Purchaser UI to see the provenance report.');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
