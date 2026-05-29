/**
 * Seed script: populates realistic multi-tier Canadian supply chains.
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

function daysAgo(days: number): string {
  return new Date(Date.now() - 86400000 * days).toISOString();
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
  { name: 'Québec Textiles', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Alberta Metals', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Ontario Glass Works', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'US Steel Supply', location: 'US', keyPair: nacl.sign.keyPair() },
  { name: 'Texas Plastics Corp', location: 'US', keyPair: nacl.sign.keyPair() },
  { name: 'Shenzhen Electronics', location: 'CN', keyPair: nacl.sign.keyPair() },
  { name: 'Guangzhou Battery Co.', location: 'CN', keyPair: nacl.sign.keyPair() },
  { name: 'Bavaria Motors GmbH', location: 'DE', keyPair: nacl.sign.keyPair() },
  { name: 'Tokyo Precision Ltd.', location: 'JP', keyPair: nacl.sign.keyPair() },
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
    throw new Error(`Failed to register "${supplier.name}": ${res.status} ${body}`);
  }

  const data = await res.json();
  console.log(`  ✓ ${supplier.name} (${supplier.location}) → ${data.id}`);
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

async function submit(
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
    body: JSON.stringify({ payload, signature: sigHex, publicKey: pubKeyHex }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed: "${payload.productName}": ${res.status} ${body}`);
  }

  const data = await res.json();
  console.log(`  ✓ ${payload.productName} (${payload.location}) → ${data.id}`);
  return { id: data.id, contentHash: data.contentHash };
}

// ============================================================================
// Main seed logic
// ============================================================================

async function main() {
  console.log('🌱 Seeding supply chain data...\n');

  // --- Register all suppliers ---
  console.log('📋 Registering suppliers...');
  const ids: string[] = [];
  for (const s of suppliers) {
    ids.push(await registerSupplier(s));
  }
  console.log('');

  const [
    northernTimber, mapleResin, pacificAssembly, quebecTextiles,
    albertaMetals, ontarioGlass, usSteel, texasPlastics,
    shenzhenElec, guangzhouBattery, bavariaMotors, tokyoPrecision,
  ] = suppliers;
  const [
    northernTimberId, mapleResinId, pacificAssemblyId, quebecTextilesId,
    albertaMetalsId, ontarioGlassId, usSteelId, texasPlasticsId,
    shenzhenElecId, guangzhouBatteryId, bavariaMotorsId, tokyoPrecisionId,
  ] = ids;

  // Product IDs
  const productOfCanadaId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const madeInCanadaId    = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
  const noneDesignationId = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f';
  const evBikeId          = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80';

  // =========================================================================
  // Chain 1: "Product of Canada" — Handcrafted Maple Furniture
  // 5 steps, all Canadian, 100% CA content
  // =========================================================================
  console.log('🍁 Chain 1: Product of Canada — Handcrafted Maple Furniture (5 steps)');

  const rawLogs = await submit(northernTimber, northernTimberId, {
    productName: 'Raw Maple Logs',
    productId: productOfCanadaId,
    supplierId: northernTimberId,
    location: 'CA',
    materialCost: 120,
    labourCost: 80,
    currency: 'CAD',
    outputQuantity: 200,
    outputUnit: 'kg',
    timestamp: daysAgo(10),
    isTransformation: false,
    inputs: [],
  });

  const kilnDried = await submit(northernTimber, northernTimberId, {
    productName: 'Kiln-Dried Maple Planks',
    productId: productOfCanadaId,
    supplierId: northernTimberId,
    location: 'CA',
    materialCost: 50,
    labourCost: 90,
    currency: 'CAD',
    outputQuantity: 150,
    outputUnit: 'kg',
    timestamp: daysAgo(8),
    isTransformation: true,
    inputs: [{ attestationId: rawLogs.id, quantityUsed: 180, unit: 'kg' }],
  });

  const woodFinish = await submit(mapleResin, mapleResinId, {
    productName: 'Natural Maple Varnish',
    productId: productOfCanadaId,
    supplierId: mapleResinId,
    location: 'CA',
    materialCost: 60,
    labourCost: 30,
    currency: 'CAD',
    outputQuantity: 20,
    outputUnit: 'L',
    timestamp: daysAgo(7),
    isTransformation: true,
    inputs: [],
  });

  const caHardware = await submit(albertaMetals, albertaMetalsId, {
    productName: 'Brass Drawer Pulls & Hinges',
    productId: productOfCanadaId,
    supplierId: albertaMetalsId,
    location: 'CA',
    materialCost: 40,
    labourCost: 25,
    currency: 'CAD',
    outputQuantity: 30,
    outputUnit: 'units',
    timestamp: daysAgo(6),
    isTransformation: true,
    inputs: [],
  });

  await submit(pacificAssembly, pacificAssemblyId, {
    productName: 'Handcrafted Maple Dresser',
    productId: productOfCanadaId,
    supplierId: pacificAssemblyId,
    location: 'CA',
    materialCost: 30,
    labourCost: 350,
    currency: 'CAD',
    outputQuantity: 1,
    outputUnit: 'units',
    timestamp: daysAgo(3),
    isTransformation: true,
    inputs: [
      { attestationId: kilnDried.id, quantityUsed: 60, unit: 'kg' },
      { attestationId: woodFinish.id, quantityUsed: 5, unit: 'L' },
      { attestationId: caHardware.id, quantityUsed: 12, unit: 'units' },
    ],
  });

  console.log('');

  // =========================================================================
  // Chain 2: "Made in Canada" — Premium Winter Jacket
  // 6 steps across CA, CN, JP — assembled in Canada
  // =========================================================================
  console.log('🏭 Chain 2: Made in Canada — Premium Winter Jacket (6 steps)');

  const cnSilk = await submit(shenzhenElec, shenzhenElecId, {
    productName: 'Silk Lining Fabric',
    productId: madeInCanadaId,
    supplierId: shenzhenElecId,
    location: 'CN',
    materialCost: 45,
    labourCost: 15,
    currency: 'CAD',
    outputQuantity: 50,
    outputUnit: 'm',
    timestamp: daysAgo(14),
    isTransformation: false,
    inputs: [],
  });

  const jpZippers = await submit(tokyoPrecision, tokyoPrecisionId, {
    productName: 'YKK Premium Zippers',
    productId: madeInCanadaId,
    supplierId: tokyoPrecisionId,
    location: 'JP',
    materialCost: 20,
    labourCost: 10,
    currency: 'CAD',
    outputQuantity: 100,
    outputUnit: 'units',
    timestamp: daysAgo(13),
    isTransformation: true,
    inputs: [],
  });

  const caDown = await submit(quebecTextiles, quebecTextilesId, {
    productName: 'Canadian Goose Down Fill',
    productId: madeInCanadaId,
    supplierId: quebecTextilesId,
    location: 'CA',
    materialCost: 180,
    labourCost: 60,
    currency: 'CAD',
    outputQuantity: 25,
    outputUnit: 'kg',
    timestamp: daysAgo(12),
    isTransformation: false,
    inputs: [],
  });

  const caShell = await submit(quebecTextiles, quebecTextilesId, {
    productName: 'Waterproof Nylon Shell',
    productId: madeInCanadaId,
    supplierId: quebecTextilesId,
    location: 'CA',
    materialCost: 70,
    labourCost: 40,
    currency: 'CAD',
    outputQuantity: 30,
    outputUnit: 'm',
    timestamp: daysAgo(10),
    isTransformation: true,
    inputs: [],
  });

  const caInsulated = await submit(quebecTextiles, quebecTextilesId, {
    productName: 'Insulated Panel Assembly',
    productId: madeInCanadaId,
    supplierId: quebecTextilesId,
    location: 'CA',
    materialCost: 20,
    labourCost: 80,
    currency: 'CAD',
    outputQuantity: 15,
    outputUnit: 'units',
    timestamp: daysAgo(8),
    isTransformation: true,
    inputs: [
      { attestationId: caDown.id, quantityUsed: 10, unit: 'kg' },
      { attestationId: caShell.id, quantityUsed: 15, unit: 'm' },
    ],
  });

  await submit(quebecTextiles, quebecTextilesId, {
    productName: 'Premium Winter Parka',
    productId: madeInCanadaId,
    supplierId: quebecTextilesId,
    location: 'CA',
    materialCost: 15,
    labourCost: 120,
    currency: 'CAD',
    outputQuantity: 1,
    outputUnit: 'units',
    timestamp: daysAgo(5),
    isTransformation: true,
    inputs: [
      { attestationId: caInsulated.id, quantityUsed: 1, unit: 'units' },
      { attestationId: cnSilk.id, quantityUsed: 3, unit: 'm' },
      { attestationId: jpZippers.id, quantityUsed: 3, unit: 'units' },
    ],
  });

  console.log('');

  // =========================================================================
  // Chain 3: "None" — Smart Home Hub (mostly CN/US, packaged in CN)
  // 5 steps, global supply chain, no Canadian content
  // =========================================================================
  console.log('❌ Chain 3: No Designation — Smart Home Hub (5 steps)');

  const cnChip = await submit(shenzhenElec, shenzhenElecId, {
    productName: 'ARM Cortex-A53 SoC',
    productId: noneDesignationId,
    supplierId: shenzhenElecId,
    location: 'CN',
    materialCost: 85,
    labourCost: 35,
    currency: 'CAD',
    outputQuantity: 500,
    outputUnit: 'units',
    timestamp: daysAgo(20),
    isTransformation: true,
    inputs: [],
  });

  const cnWifi = await submit(shenzhenElec, shenzhenElecId, {
    productName: 'WiFi 6 Radio Module',
    productId: noneDesignationId,
    supplierId: shenzhenElecId,
    location: 'CN',
    materialCost: 40,
    labourCost: 20,
    currency: 'CAD',
    outputQuantity: 500,
    outputUnit: 'units',
    timestamp: daysAgo(19),
    isTransformation: true,
    inputs: [],
  });

  const usPlastic = await submit(texasPlastics, texasPlasticsId, {
    productName: 'Injection Molded Enclosure',
    productId: noneDesignationId,
    supplierId: texasPlasticsId,
    location: 'US',
    materialCost: 30,
    labourCost: 15,
    currency: 'CAD',
    outputQuantity: 200,
    outputUnit: 'units',
    timestamp: daysAgo(18),
    isTransformation: true,
    inputs: [],
  });

  const cnPCB = await submit(shenzhenElec, shenzhenElecId, {
    productName: 'Main PCB Assembly',
    productId: noneDesignationId,
    supplierId: shenzhenElecId,
    location: 'CN',
    materialCost: 25,
    labourCost: 45,
    currency: 'CAD',
    outputQuantity: 300,
    outputUnit: 'units',
    timestamp: daysAgo(15),
    isTransformation: true,
    inputs: [
      { attestationId: cnChip.id, quantityUsed: 300, unit: 'units' },
      { attestationId: cnWifi.id, quantityUsed: 300, unit: 'units' },
    ],
  });

  await submit(shenzhenElec, shenzhenElecId, {
    productName: 'Smart Home Hub v3',
    productId: noneDesignationId,
    supplierId: shenzhenElecId,
    location: 'CN',
    materialCost: 10,
    labourCost: 30,
    currency: 'CAD',
    outputQuantity: 100,
    outputUnit: 'units',
    timestamp: daysAgo(12),
    isTransformation: true,
    inputs: [
      { attestationId: cnPCB.id, quantityUsed: 100, unit: 'units' },
      { attestationId: usPlastic.id, quantityUsed: 100, unit: 'units' },
    ],
  });

  console.log('');

  // =========================================================================
  // Chain 4: "Made in Canada" — Electric Cargo Bike
  // 8 steps across CA, US, CN, DE, JP — complex multi-country chain
  // =========================================================================
  console.log('🚲 Chain 4: Made in Canada — Electric Cargo Bike (8 steps)');

  const jpGears = await submit(tokyoPrecision, tokyoPrecisionId, {
    productName: 'Shimano Internal Gear Hub',
    productId: evBikeId,
    supplierId: tokyoPrecisionId,
    location: 'JP',
    materialCost: 95,
    labourCost: 55,
    currency: 'CAD',
    outputQuantity: 50,
    outputUnit: 'units',
    timestamp: daysAgo(30),
    isTransformation: true,
    inputs: [],
  });

  const deMotor = await submit(bavariaMotors, bavariaMotorsId, {
    productName: 'Bosch Mid-Drive Motor',
    productId: evBikeId,
    supplierId: bavariaMotorsId,
    location: 'DE',
    materialCost: 220,
    labourCost: 130,
    currency: 'CAD',
    outputQuantity: 40,
    outputUnit: 'units',
    timestamp: daysAgo(28),
    isTransformation: true,
    inputs: [],
  });

  const cnBattery = await submit(guangzhouBattery, guangzhouBatteryId, {
    productName: 'Li-Ion 48V 20Ah Battery Pack',
    productId: evBikeId,
    supplierId: guangzhouBatteryId,
    location: 'CN',
    materialCost: 180,
    labourCost: 60,
    currency: 'CAD',
    outputQuantity: 60,
    outputUnit: 'units',
    timestamp: daysAgo(26),
    isTransformation: true,
    inputs: [],
  });

  const caFrame = await submit(albertaMetals, albertaMetalsId, {
    productName: 'Aluminum Cargo Frame',
    productId: evBikeId,
    supplierId: albertaMetalsId,
    location: 'CA',
    materialCost: 160,
    labourCost: 120,
    currency: 'CAD',
    outputQuantity: 30,
    outputUnit: 'units',
    timestamp: daysAgo(24),
    isTransformation: true,
    inputs: [],
  });

  const caWheels = await submit(albertaMetals, albertaMetalsId, {
    productName: 'Heavy-Duty Wheel Set',
    productId: evBikeId,
    supplierId: albertaMetalsId,
    location: 'CA',
    materialCost: 80,
    labourCost: 50,
    currency: 'CAD',
    outputQuantity: 30,
    outputUnit: 'pairs',
    timestamp: daysAgo(22),
    isTransformation: true,
    inputs: [],
  });

  const caCargoBox = await submit(ontarioGlass, ontarioGlassId, {
    productName: 'Insulated Cargo Box',
    productId: evBikeId,
    supplierId: ontarioGlassId,
    location: 'CA',
    materialCost: 90,
    labourCost: 70,
    currency: 'CAD',
    outputQuantity: 25,
    outputUnit: 'units',
    timestamp: daysAgo(20),
    isTransformation: true,
    inputs: [],
  });

  const caDrivetrain = await submit(pacificAssembly, pacificAssemblyId, {
    productName: 'E-Drive Assembly',
    productId: evBikeId,
    supplierId: pacificAssemblyId,
    location: 'CA',
    materialCost: 30,
    labourCost: 150,
    currency: 'CAD',
    outputQuantity: 20,
    outputUnit: 'units',
    timestamp: daysAgo(16),
    isTransformation: true,
    inputs: [
      { attestationId: deMotor.id, quantityUsed: 20, unit: 'units' },
      { attestationId: cnBattery.id, quantityUsed: 20, unit: 'units' },
      { attestationId: jpGears.id, quantityUsed: 20, unit: 'units' },
    ],
  });

  await submit(pacificAssembly, pacificAssemblyId, {
    productName: 'Electric Cargo Bike — Maple Edition',
    productId: evBikeId,
    supplierId: pacificAssemblyId,
    location: 'CA',
    materialCost: 40,
    labourCost: 280,
    currency: 'CAD',
    outputQuantity: 1,
    outputUnit: 'units',
    timestamp: daysAgo(10),
    isTransformation: true,
    inputs: [
      { attestationId: caDrivetrain.id, quantityUsed: 1, unit: 'units' },
      { attestationId: caFrame.id, quantityUsed: 1, unit: 'units' },
      { attestationId: caWheels.id, quantityUsed: 1, unit: 'pairs' },
      { attestationId: caCargoBox.id, quantityUsed: 1, unit: 'units' },
    ],
  });

  console.log('');

  // =========================================================================
  // Done
  // =========================================================================
  console.log('✅ Seed complete!\n');
  console.log('Product IDs for provenance lookup:');
  console.log(`  🍁 Product of Canada (5 steps):  ${productOfCanadaId}`);
  console.log(`  🏭 Made in Canada — Jacket (6):  ${madeInCanadaId}`);
  console.log(`  ❌ No Designation — Hub (5):      ${noneDesignationId}`);
  console.log(`  🚲 Made in Canada — E-Bike (8):  ${evBikeId}`);
  console.log('');
  console.log('Paste any of these into the Purchaser UI to see the provenance report.');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
