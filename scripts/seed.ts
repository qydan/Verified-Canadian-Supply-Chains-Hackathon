/**
 * Seed script: populates realistic multi-tier Canadian supply chains
 * focused on the Canadian drone sector (defence & dual-use).
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
// Supplier definitions — diverse global supply chain for drone sector
// ============================================================================

interface SupplierDef {
  name: string;
  location: string;
  keyPair: nacl.SignKeyPair;
}

const suppliers: SupplierDef[] = [
  // Canada
  { name: 'MapleDrone Systems', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Prairie Carbon Composites', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Ottawa Avionics Corp', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'BC Precision Machining', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Québec Optics Lab', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Nova Scotia Wiring', location: 'CA', keyPair: nacl.sign.keyPair() },
  { name: 'Manitoba Rubber & Seals', location: 'CA', keyPair: nacl.sign.keyPair() },
  // United States
  { name: 'Texas Semiconductor Inc', location: 'US', keyPair: nacl.sign.keyPair() },
  { name: 'California Propulsion', location: 'US', keyPair: nacl.sign.keyPair() },
  // China
  { name: 'Shenzhen Microelectronics', location: 'CN', keyPair: nacl.sign.keyPair() },
  { name: 'Dongguan Battery Tech', location: 'CN', keyPair: nacl.sign.keyPair() },
  // Germany
  { name: 'Stuttgart Precision Motors', location: 'DE', keyPair: nacl.sign.keyPair() },
  // Japan
  { name: 'Osaka Sensor Corp', location: 'JP', keyPair: nacl.sign.keyPair() },
  // South Korea
  { name: 'Seoul Display Tech', location: 'KR', keyPair: nacl.sign.keyPair() },
  // United Kingdom
  { name: 'Bristol Aerospace Ltd', location: 'GB', keyPair: nacl.sign.keyPair() },
  // Israel
  { name: 'Tel Aviv Guidance Systems', location: 'IL', keyPair: nacl.sign.keyPair() },
  // France
  { name: 'Toulouse Aero Components', location: 'FR', keyPair: nacl.sign.keyPair() },
  // India
  { name: 'Bangalore Software Labs', location: 'IN', keyPair: nacl.sign.keyPair() },
  // Taiwan
  { name: 'Taipei Chip Foundry', location: 'TW', keyPair: nacl.sign.keyPair() },
  // Mexico
  { name: 'Monterrey Metals SA', location: 'MX', keyPair: nacl.sign.keyPair() },
  // Brazil
  { name: 'São Paulo Composites', location: 'BR', keyPair: nacl.sign.keyPair() },
  // Australia
  { name: 'Sydney Mining Tech', location: 'AU', keyPair: nacl.sign.keyPair() },
  // Italy
  { name: 'Milano Precision Optics', location: 'IT', keyPair: nacl.sign.keyPair() },
];

// ============================================================================
// API helpers
// ============================================================================

async function registerSupplier(supplier: SupplierDef): Promise<string> {
  const pubKeyHex = bytesToHex(supplier.keyPair.publicKey);
  const res = await fetch(`${API_BASE}/suppliers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: supplier.name, publicKey: pubKeyHex, location: supplier.location }),
  });
  if (!res.ok) throw new Error(`Failed to register "${supplier.name}": ${res.status} ${await res.text()}`);
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
  const res = await fetch(`${API_BASE}/attestations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, signature: bytesToHex(sig), publicKey: bytesToHex(supplier.keyPair.publicKey) }),
  });
  if (!res.ok) throw new Error(`Failed: "${payload.productName}": ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(`  ✓ ${payload.productName} (${payload.location}) → ${data.id}`);
  return { id: data.id, contentHash: data.contentHash };
}

/** Shorthand for building a payload */
function p(
  name: string, productId: string, supplierId: string, location: string,
  mat: number, lab: number, qty: number, unit: string, ts: string,
  transform: boolean, inputs: AttestationPayload['inputs'] = [],
): AttestationPayload {
  return {
    productName: name, productId, supplierId, location,
    materialCost: mat, labourCost: lab, currency: 'CAD',
    outputQuantity: qty, outputUnit: unit, timestamp: ts,
    isTransformation: transform, inputs,
  };
}

// ============================================================================
// Main seed logic
// ============================================================================

async function main() {
  console.log('🌱 Seeding Canadian drone supply chain data...\n');

  console.log('📋 Registering suppliers...');
  const ids: string[] = [];
  for (const s of suppliers) ids.push(await registerSupplier(s));
  console.log('');

  const [
    mapleDrone, prairieCarbon, ottawaAvionics, bcPrecision, quebecOptics, novaScotiaWiring, manitobaRubber,
    texasSemi, calPropulsion,
    shenzhenMicro, dongguanBattery,
    stuttgartMotors,
    osakaSensor,
    seoulDisplay,
    bristolAero,
    telavivGuidance,
    toulouseAero,
    bangaloreSoftware,
    taipeiChip,
    monterreyMetals,
    saoPauloComposites,
    sydneyMining,
    milanoOptics,
  ] = suppliers;
  const [
    mapleDroneId, prairieCarbonId, ottawaAvionicsId, bcPrecisionId, quebecOpticsId, novaScotiaWiringId, manitobaRubberId,
    texasSemiId, calPropulsionId,
    shenzhenMicroId, dongguanBatteryId,
    stuttgartMotorsId,
    osakaSensorId,
    seoulDisplayId,
    bristolAeroId,
    telavivGuidanceId,
    toulouseAeroId,
    bangaloreSoftwareId,
    taipeiChipId,
    monterreyMetalsId,
    saoPauloCompositesId,
    sydneyMiningId,
    milanoOpticsId,
  ] = ids;

  // Product IDs
  const reconDroneId     = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'; // Product of Canada
  const cargoDroneId     = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e'; // Made in Canada
  const consumerDroneId  = 'c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f'; // None
  const defenceDroneId   = 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f80'; // Made in Canada (complex)
  const agriDroneId      = 'e5f6a7b8-c9d0-4e1f-2a3b-4c5d6e7f8091'; // Product of Canada
  const maritimeDroneId  = 'f6a7b8c9-d0e1-4f2a-3b4c-5d6e7f809102'; // Made in Canada
  const armVehicleId     = '01234567-89ab-4cde-f012-3456789abcde'; // Made in Canada (non-drone, 15+ steps)
  const singleStepId     = '11112222-3333-4444-5555-666677778888'; // Product of Canada (single step edge case)

  // =========================================================================
  // Chain 1: "Product of Canada" — Reconnaissance Drone (10 steps, all CA)
  // Military-grade ISR drone, entirely Canadian supply chain
  // =========================================================================
  console.log('🍁 Chain 1: Product of Canada — Recon Drone (10 steps, all CA)');

  const carbonFiber = await submit(prairieCarbon, prairieCarbonId,
    p('Carbon Fiber Sheets', reconDroneId, prairieCarbonId, 'CA', 400, 200, 100, 'kg', daysAgo(30), false));

  const airframe = await submit(prairieCarbon, prairieCarbonId,
    p('Composite Airframe Structure', reconDroneId, prairieCarbonId, 'CA', 100, 350, 10, 'units', daysAgo(28), true,
      [{ attestationId: carbonFiber.id, quantityUsed: 80, unit: 'kg' }]));

  const flightController = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Flight Controller Board', reconDroneId, ottawaAvionicsId, 'CA', 180, 220, 50, 'units', daysAgo(26), true));

  const gpsModule = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Military GPS/GNSS Module', reconDroneId, ottawaAvionicsId, 'CA', 250, 150, 50, 'units', daysAgo(25), true));

  const irCamera = await submit(quebecOptics, quebecOpticsId,
    p('Infrared Camera Module', reconDroneId, quebecOpticsId, 'CA', 600, 400, 20, 'units', daysAgo(24), true));

  const caMotors = await submit(bcPrecision, bcPrecisionId,
    p('Brushless DC Motors (set of 4)', reconDroneId, bcPrecisionId, 'CA', 200, 120, 30, 'sets', daysAgo(23), true));

  const wiring = await submit(novaScotiaWiring, novaScotiaWiringId,
    p('Mil-Spec Wiring Harness', reconDroneId, novaScotiaWiringId, 'CA', 80, 60, 40, 'units', daysAgo(22), false));

  const propellers = await submit(bcPrecision, bcPrecisionId,
    p('Carbon Fiber Propellers (set of 4)', reconDroneId, bcPrecisionId, 'CA', 60, 40, 30, 'sets', daysAgo(21), true));

  const avionicsInteg = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Integrated Avionics Package', reconDroneId, ottawaAvionicsId, 'CA', 50, 300, 15, 'units', daysAgo(18), true,
      [{ attestationId: flightController.id, quantityUsed: 15, unit: 'units' },
       { attestationId: gpsModule.id, quantityUsed: 15, unit: 'units' }]));

  await submit(mapleDrone, mapleDroneId,
    p('Maple Hawk ISR Drone', reconDroneId, mapleDroneId, 'CA', 80, 600, 1, 'units', daysAgo(10), true,
      [{ attestationId: airframe.id, quantityUsed: 1, unit: 'units' },
       { attestationId: avionicsInteg.id, quantityUsed: 1, unit: 'units' },
       { attestationId: irCamera.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caMotors.id, quantityUsed: 1, unit: 'sets' },
       { attestationId: wiring.id, quantityUsed: 1, unit: 'units' },
       { attestationId: propellers.id, quantityUsed: 1, unit: 'sets' }]));

  console.log('');

  // =========================================================================
  // Chain 2: "Made in Canada" — Cargo Delivery Drone (8 steps, CA/US/CN/DE)
  // Commercial cargo drone with international components
  // =========================================================================
  console.log('🏭 Chain 2: Made in Canada — Cargo Drone (8 steps, CA/US/CN/DE)');

  const cnBattery = await submit(dongguanBattery, dongguanBatteryId,
    p('Li-Po 6S 22000mAh Battery', cargoDroneId, dongguanBatteryId, 'CN', 150, 40, 200, 'units', daysAgo(35), true));

  const deMotors = await submit(stuttgartMotors, stuttgartMotorsId,
    p('Heavy-Lift Brushless Motors', cargoDroneId, stuttgartMotorsId, 'DE', 300, 180, 100, 'sets', daysAgo(33), true));

  const usChip = await submit(texasSemi, texasSemiId,
    p('ARM Cortex-M7 MCU', cargoDroneId, texasSemiId, 'US', 60, 30, 500, 'units', daysAgo(32), true));

  const caFrame = await submit(prairieCarbon, prairieCarbonId,
    p('Heavy-Lift Carbon Frame', cargoDroneId, prairieCarbonId, 'CA', 250, 180, 20, 'units', daysAgo(28), true));

  const caPayloadBay = await submit(bcPrecision, bcPrecisionId,
    p('Cargo Payload Bay Assembly', cargoDroneId, bcPrecisionId, 'CA', 120, 90, 20, 'units', daysAgo(26), true));

  const caFlightSys = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Autonomous Flight System', cargoDroneId, ottawaAvionicsId, 'CA', 100, 400, 15, 'units', daysAgo(22), true,
      [{ attestationId: usChip.id, quantityUsed: 30, unit: 'units' }]));

  const caPowerSys = await submit(novaScotiaWiring, novaScotiaWiringId,
    p('Power Distribution System', cargoDroneId, novaScotiaWiringId, 'CA', 60, 80, 15, 'units', daysAgo(20), true,
      [{ attestationId: cnBattery.id, quantityUsed: 30, unit: 'units' }]));

  await submit(mapleDrone, mapleDroneId,
    p('Maple Lifter Cargo Drone', cargoDroneId, mapleDroneId, 'CA', 50, 500, 1, 'units', daysAgo(12), true,
      [{ attestationId: caFrame.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caPayloadBay.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caFlightSys.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caPowerSys.id, quantityUsed: 1, unit: 'units' },
       { attestationId: deMotors.id, quantityUsed: 1, unit: 'sets' }]));

  console.log('');

  // =========================================================================
  // Chain 3: "None" — Consumer Camera Drone (7 steps, mostly CN/TW/KR)
  // Assembled in China, no Canadian content
  // =========================================================================
  console.log('❌ Chain 3: No Designation — Consumer Drone (7 steps, CN/TW/KR/US)');

  const twSoC = await submit(taipeiChip, taipeiChipId,
    p('Drone SoC (ISP + Flight Core)', consumerDroneId, taipeiChipId, 'TW', 120, 80, 1000, 'units', daysAgo(40), true));

  const krOled = await submit(seoulDisplay, seoulDisplayId,
    p('5.5" OLED Controller Display', consumerDroneId, seoulDisplayId, 'KR', 45, 25, 500, 'units', daysAgo(38), true));

  const cnGimbal = await submit(shenzhenMicro, shenzhenMicroId,
    p('3-Axis Gimbal Assembly', consumerDroneId, shenzhenMicroId, 'CN', 80, 50, 300, 'units', daysAgo(36), true));

  const cnCamera = await submit(shenzhenMicro, shenzhenMicroId,
    p('4K Camera Module', consumerDroneId, shenzhenMicroId, 'CN', 90, 40, 300, 'units', daysAgo(35), true));

  const cnBatt2 = await submit(dongguanBattery, dongguanBatteryId,
    p('Intelligent Flight Battery', consumerDroneId, dongguanBatteryId, 'CN', 60, 20, 500, 'units', daysAgo(34), true));

  const usRemote = await submit(calPropulsion, calPropulsionId,
    p('RC Transmitter Unit', consumerDroneId, calPropulsionId, 'US', 35, 20, 200, 'units', daysAgo(32), true));

  await submit(shenzhenMicro, shenzhenMicroId,
    p('SkyView Pro Consumer Drone', consumerDroneId, shenzhenMicroId, 'CN', 30, 60, 100, 'units', daysAgo(25), true,
      [{ attestationId: twSoC.id, quantityUsed: 100, unit: 'units' },
       { attestationId: krOled.id, quantityUsed: 100, unit: 'units' },
       { attestationId: cnGimbal.id, quantityUsed: 100, unit: 'units' },
       { attestationId: cnCamera.id, quantityUsed: 100, unit: 'units' },
       { attestationId: cnBatt2.id, quantityUsed: 100, unit: 'units' },
       { attestationId: usRemote.id, quantityUsed: 100, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Chain 4: "Made in Canada" — Defence VTOL Drone (12 steps, CA/US/GB/IL/FR/JP)
  // Complex military drone with NATO-allied supply chain
  // =========================================================================
  console.log('🛡️  Chain 4: Made in Canada — Defence VTOL (12 steps, CA/US/GB/IL/FR/JP)');

  const gbRadar = await submit(bristolAero, bristolAeroId,
    p('X-Band Radar Module', defenceDroneId, bristolAeroId, 'GB', 800, 500, 20, 'units', daysAgo(50), true));

  const ilGuidance = await submit(telavivGuidance, telavivGuidanceId,
    p('INS/GPS Guidance Unit', defenceDroneId, telavivGuidanceId, 'IL', 600, 350, 30, 'units', daysAgo(48), true));

  const frEngine = await submit(toulouseAero, toulouseAeroId,
    p('Turboprop Micro-Engine', defenceDroneId, toulouseAeroId, 'FR', 1200, 800, 15, 'units', daysAgo(46), true));

  const jpSensor = await submit(osakaSensor, osakaSensorId,
    p('Multi-Spectral Sensor Array', defenceDroneId, osakaSensorId, 'JP', 500, 300, 25, 'units', daysAgo(44), true));

  const usComms = await submit(texasSemi, texasSemiId,
    p('Encrypted SATCOM Radio', defenceDroneId, texasSemiId, 'US', 400, 200, 30, 'units', daysAgo(42), true));

  const caAirframe2 = await submit(prairieCarbon, prairieCarbonId,
    p('Stealth Composite Airframe', defenceDroneId, prairieCarbonId, 'CA', 600, 500, 8, 'units', daysAgo(40), true));

  const caLanding = await submit(bcPrecision, bcPrecisionId,
    p('Retractable Landing Gear', defenceDroneId, bcPrecisionId, 'CA', 150, 100, 15, 'units', daysAgo(38), true));

  const caEW = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Electronic Warfare Suite', defenceDroneId, ottawaAvionicsId, 'CA', 900, 700, 10, 'units', daysAgo(35), true));

  const caSensorFusion = await submit(quebecOptics, quebecOpticsId,
    p('Sensor Fusion Processor', defenceDroneId, quebecOpticsId, 'CA', 200, 350, 10, 'units', daysAgo(32), true,
      [{ attestationId: jpSensor.id, quantityUsed: 10, unit: 'units' },
       { attestationId: gbRadar.id, quantityUsed: 10, unit: 'units' }]));

  const caNavComms = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Navigation & Comms Integration', defenceDroneId, ottawaAvionicsId, 'CA', 100, 450, 8, 'units', daysAgo(28), true,
      [{ attestationId: ilGuidance.id, quantityUsed: 8, unit: 'units' },
       { attestationId: usComms.id, quantityUsed: 8, unit: 'units' }]));

  const caPropulsion = await submit(bcPrecision, bcPrecisionId,
    p('Hybrid Propulsion Assembly', defenceDroneId, bcPrecisionId, 'CA', 200, 300, 6, 'units', daysAgo(24), true,
      [{ attestationId: frEngine.id, quantityUsed: 6, unit: 'units' }]));

  await submit(mapleDrone, mapleDroneId,
    p('Maple Guardian VTOL UAV', defenceDroneId, mapleDroneId, 'CA', 100, 1200, 1, 'units', daysAgo(14), true,
      [{ attestationId: caAirframe2.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caLanding.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caEW.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caSensorFusion.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caNavComms.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caPropulsion.id, quantityUsed: 1, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Chain 5: "Product of Canada" — Agricultural Sprayer Drone (6 steps, all CA)
  // =========================================================================
  console.log('🌾 Chain 5: Product of Canada — Agri Sprayer Drone (6 steps, all CA)');

  const caTank = await submit(bcPrecision, bcPrecisionId,
    p('10L Spray Tank Assembly', agriDroneId, bcPrecisionId, 'CA', 80, 50, 50, 'units', daysAgo(20), true));

  const caPump = await submit(bcPrecision, bcPrecisionId,
    p('Precision Spray Nozzle System', agriDroneId, bcPrecisionId, 'CA', 120, 80, 40, 'units', daysAgo(19), true));

  const caAgriFrame = await submit(prairieCarbon, prairieCarbonId,
    p('Agricultural Drone Frame', agriDroneId, prairieCarbonId, 'CA', 180, 120, 20, 'units', daysAgo(18), true));

  const caAgriMotors = await submit(bcPrecision, bcPrecisionId,
    p('Waterproof Motor Set (6x)', agriDroneId, bcPrecisionId, 'CA', 240, 100, 20, 'sets', daysAgo(17), true));

  const caAgriNav = await submit(ottawaAvionics, ottawaAvionicsId,
    p('RTK GPS Autopilot System', agriDroneId, ottawaAvionicsId, 'CA', 300, 250, 15, 'units', daysAgo(15), true));

  await submit(mapleDrone, mapleDroneId,
    p('Maple Sprayer AG-600', agriDroneId, mapleDroneId, 'CA', 60, 400, 1, 'units', daysAgo(8), true,
      [{ attestationId: caTank.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caPump.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caAgriFrame.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caAgriMotors.id, quantityUsed: 1, unit: 'sets' },
       { attestationId: caAgriNav.id, quantityUsed: 1, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Chain 6: "Made in Canada" — Maritime Patrol Drone (9 steps, CA/GB/IN/KR/US)
  // Naval surveillance drone with software from India, displays from Korea
  // =========================================================================
  console.log('🚢 Chain 6: Made in Canada — Maritime Patrol Drone (9 steps, CA/GB/IN/KR/US)');

  const inSoftware = await submit(bangaloreSoftware, bangaloreSoftwareId,
    p('AI Target Recognition Software', maritimeDroneId, bangaloreSoftwareId, 'IN', 50, 300, 10, 'licenses', daysAgo(45), true));

  const krDisplay = await submit(seoulDisplay, seoulDisplayId,
    p('Ruggedized Ground Station Display', maritimeDroneId, seoulDisplayId, 'KR', 200, 80, 30, 'units', daysAgo(42), true));

  const gbSonar = await submit(bristolAero, bristolAeroId,
    p('Sonobuoy Deployment Module', maritimeDroneId, bristolAeroId, 'GB', 400, 250, 15, 'units', daysAgo(40), true));

  const usDatalink = await submit(texasSemi, texasSemiId,
    p('Beyond-Line-of-Sight Datalink', maritimeDroneId, texasSemiId, 'US', 350, 150, 20, 'units', daysAgo(38), true));

  const caMaritimeFrame = await submit(prairieCarbon, prairieCarbonId,
    p('Corrosion-Resistant Airframe', maritimeDroneId, prairieCarbonId, 'CA', 400, 300, 8, 'units', daysAgo(34), true));

  const caMaritimeNav = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Maritime Navigation Suite', maritimeDroneId, ottawaAvionicsId, 'CA', 200, 350, 8, 'units', daysAgo(30), true,
      [{ attestationId: usDatalink.id, quantityUsed: 8, unit: 'units' }]));

  const caGroundStation = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Ground Control Station', maritimeDroneId, ottawaAvionicsId, 'CA', 150, 400, 5, 'units', daysAgo(26), true,
      [{ attestationId: krDisplay.id, quantityUsed: 10, unit: 'units' },
       { attestationId: inSoftware.id, quantityUsed: 5, unit: 'licenses' }]));

  const caSensorPod = await submit(quebecOptics, quebecOpticsId,
    p('Maritime Surveillance Pod', maritimeDroneId, quebecOpticsId, 'CA', 500, 350, 6, 'units', daysAgo(22), true,
      [{ attestationId: gbSonar.id, quantityUsed: 6, unit: 'units' }]));

  await submit(mapleDrone, mapleDroneId,
    p('Maple Sentinel Maritime UAV', maritimeDroneId, mapleDroneId, 'CA', 80, 800, 1, 'units', daysAgo(12), true,
      [{ attestationId: caMaritimeFrame.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caMaritimeNav.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caGroundStation.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caSensorPod.id, quantityUsed: 1, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Chain 7: "Made in Canada" — Armoured Vehicle (15 steps, 7 countries)
  // Non-drone product to show system generality. Deep chain.
  // =========================================================================
  console.log('🚗 Chain 7: Made in Canada — Armoured Vehicle (15 steps, CA/US/DE/MX/BR/AU/IT)');

  const auSteel = await submit(sydneyMining, sydneyMiningId,
    p('High-Strength Steel Plate', armVehicleId, sydneyMiningId, 'AU', 500, 200, 50, 'tonnes', daysAgo(60), false));

  const mxAluminum = await submit(monterreyMetals, monterreyMetalsId,
    p('Aluminum Alloy Ingots', armVehicleId, monterreyMetalsId, 'MX', 300, 100, 30, 'tonnes', daysAgo(58), false));

  const brRubber = await submit(saoPauloComposites, saoPauloCompositesId,
    p('Ballistic Rubber Compound', armVehicleId, saoPauloCompositesId, 'BR', 200, 80, 20, 'tonnes', daysAgo(56), true));

  const itGlass = await submit(milanoOptics, milanoOpticsId,
    p('Ballistic Glass Panels', armVehicleId, milanoOpticsId, 'IT', 400, 250, 40, 'units', daysAgo(54), true));

  const deEngine = await submit(stuttgartMotors, stuttgartMotorsId,
    p('Diesel Powerpack Engine', armVehicleId, stuttgartMotorsId, 'DE', 2000, 1200, 10, 'units', daysAgo(52), true));

  const usComms2 = await submit(texasSemi, texasSemiId,
    p('Tactical Radio System', armVehicleId, texasSemiId, 'US', 600, 300, 20, 'units', daysAgo(50), true));

  const caHull = await submit(prairieCarbon, prairieCarbonId,
    p('Armoured Hull Assembly', armVehicleId, prairieCarbonId, 'CA', 800, 1500, 5, 'units', daysAgo(45), true,
      [{ attestationId: auSteel.id, quantityUsed: 20, unit: 'tonnes' },
       { attestationId: mxAluminum.id, quantityUsed: 10, unit: 'tonnes' }]));

  const caArmour = await submit(manitobaRubber, manitobaRubberId,
    p('Composite Armour Panels', armVehicleId, manitobaRubberId, 'CA', 400, 600, 8, 'units', daysAgo(42), true,
      [{ attestationId: brRubber.id, quantityUsed: 5, unit: 'tonnes' }]));

  const caTurret = await submit(bcPrecision, bcPrecisionId,
    p('Remote Weapon Station', armVehicleId, bcPrecisionId, 'CA', 1200, 800, 5, 'units', daysAgo(40), true));

  const caSuspension = await submit(bcPrecision, bcPrecisionId,
    p('Independent Suspension System', armVehicleId, bcPrecisionId, 'CA', 500, 400, 5, 'units', daysAgo(38), true));

  const caElectronics = await submit(ottawaAvionics, ottawaAvionicsId,
    p('Vehicle Electronics Suite', armVehicleId, ottawaAvionicsId, 'CA', 300, 500, 5, 'units', daysAgo(35), true,
      [{ attestationId: usComms2.id, quantityUsed: 5, unit: 'units' }]));

  const caDrivetrain = await submit(bcPrecision, bcPrecisionId,
    p('Drivetrain & Transmission', armVehicleId, bcPrecisionId, 'CA', 400, 600, 5, 'units', daysAgo(32), true,
      [{ attestationId: deEngine.id, quantityUsed: 5, unit: 'units' }]));

  const caInterior = await submit(manitobaRubber, manitobaRubberId,
    p('Crew Compartment Interior', armVehicleId, manitobaRubberId, 'CA', 200, 300, 5, 'units', daysAgo(28), true));

  const caProtection = await submit(quebecOptics, quebecOpticsId,
    p('Active Protection System', armVehicleId, quebecOpticsId, 'CA', 800, 600, 5, 'units', daysAgo(25), true,
      [{ attestationId: itGlass.id, quantityUsed: 20, unit: 'units' }]));

  await submit(mapleDrone, mapleDroneId,
    p('Maple Shield LAV', armVehicleId, mapleDroneId, 'CA', 200, 2000, 1, 'units', daysAgo(15), true,
      [{ attestationId: caHull.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caArmour.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caTurret.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caSuspension.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caElectronics.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caDrivetrain.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caInterior.id, quantityUsed: 1, unit: 'units' },
       { attestationId: caProtection.id, quantityUsed: 1, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Chain 8: "Product of Canada" — Single Step (edge case: 1 attestation)
  // Tests that the system handles a product with no inputs
  // =========================================================================
  console.log('🧪 Chain 8: Product of Canada — Single Step (edge case)');

  await submit(prairieCarbon, prairieCarbonId,
    p('Raw Carbon Fiber Roll', singleStepId, prairieCarbonId, 'CA', 500, 300, 100, 'kg', daysAgo(5), false));

  console.log('');

  // =========================================================================
  // Chain 9: ANOMALY — Replay Attack (same component claimed by two products)
  // Triggers REPLAY_DETECTED when the same input is used across products
  // =========================================================================
  console.log('⚠️  Chain 9: ANOMALY — Replay Attack (component double-counted)');

  const replayDroneId = '17a8b9c0-d1e2-4f3a-4b5c-6d7e8f901234';
  const replayDrone2Id = '27b9c0d1-e2f3-4a4b-5c6d-000000000000';

  // A shared motor set — produced once
  const sharedMotor = await submit(bcPrecision, bcPrecisionId,
    p('Shared Motor Set (fraudulent)', replayDroneId, bcPrecisionId, 'CA', 200, 120, 5, 'sets', daysAgo(12), true));

  // First drone uses it legitimately
  const replayFrame = await submit(prairieCarbon, prairieCarbonId,
    p('Lightweight Recon Frame', replayDroneId, prairieCarbonId, 'CA', 180, 100, 10, 'units', daysAgo(10), true));

  await submit(mapleDrone, mapleDroneId,
    p('Scout Drone Alpha', replayDroneId, mapleDroneId, 'CA', 30, 200, 1, 'units', daysAgo(8), true,
      [{ attestationId: replayFrame.id, quantityUsed: 1, unit: 'units' },
       { attestationId: sharedMotor.id, quantityUsed: 1, unit: 'sets' }]));

  // Second drone ALSO claims the same motor — replay/double-count!
  const replayFrame2 = await submit(prairieCarbon, prairieCarbonId,
    p('Lightweight Recon Frame B', replayDrone2Id, prairieCarbonId, 'CA', 180, 100, 10, 'units', daysAgo(7), true));

  await submit(mapleDrone, mapleDroneId,
    p('Scout Drone Beta (fraudulent)', replayDrone2Id, mapleDroneId, 'CA', 30, 200, 1, 'units', daysAgo(5), true,
      [{ attestationId: replayFrame2.id, quantityUsed: 1, unit: 'units' },
       { attestationId: sharedMotor.id, quantityUsed: 1, unit: 'sets' }]));

  console.log('');

  // =========================================================================
  // Chain 10: ANOMALY — Quantity Exceeded (claims more material than produced)
  // Triggers QUANTITY_EXCEEDS_UPSTREAM
  // =========================================================================
  console.log('⚠️  Chain 10: ANOMALY — Quantity Exceeded (over-claiming materials)');

  const quantityDroneId = '28b9c0d1-e2f3-4a4b-5c6d-7e8f90123456';

  // This small batch only produced 5 units
  const smallBatch = await submit(bcPrecision, bcPrecisionId,
    p('Limited Run Motor Set', quantityDroneId, bcPrecisionId, 'CA', 300, 200, 5, 'units', daysAgo(15), true));

  // But this assembly claims to use 10 of them — impossible!
  await submit(mapleDrone, mapleDroneId,
    p('Overclaimed Assembly Drone', quantityDroneId, mapleDroneId, 'CA', 50, 300, 1, 'units', daysAgo(7), true,
      [{ attestationId: smallBatch.id, quantityUsed: 10, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Chain 11: ANOMALY — Broken Link (references non-existent attestation)
  // Triggers BROKEN_LINK
  // =========================================================================
  console.log('⚠️  Chain 11: ANOMALY — Broken Link (missing reference)');

  const brokenLinkId = '38c0d1e2-f3a4-4b5c-6d7e-8f9012345678';

  await submit(mapleDrone, mapleDroneId,
    p('Ghost Reference Drone', brokenLinkId, mapleDroneId, 'CA', 100, 200, 1, 'units', daysAgo(3), true,
      [{ attestationId: '00000000-0000-0000-0000-000000000000', quantityUsed: 5, unit: 'units' }]));

  console.log('');

  // =========================================================================
  // Done
  // =========================================================================
  console.log('✅ Seed complete!\n');
  console.log('Product IDs for provenance lookup:');
  console.log(`  🍁 Product of Canada — Recon Drone (10):     ${reconDroneId}`);
  console.log(`  🏭 Made in Canada — Cargo Drone (8):         ${cargoDroneId}`);
  console.log(`  ❌ No Designation — Consumer Drone (7):       ${consumerDroneId}`);
  console.log(`  🛡️  Made in Canada — Defence VTOL (12):       ${defenceDroneId}`);
  console.log(`  🌾 Product of Canada — Agri Drone (6):       ${agriDroneId}`);
  console.log(`  🚢 Made in Canada — Maritime Drone (9):      ${maritimeDroneId}`);
  console.log(`  🚗 Made in Canada — Armoured Vehicle (15):   ${armVehicleId}`);
  console.log(`  🧪 Product of Canada — Single Step (1):      ${singleStepId}`);
  console.log(`  ⚠️  ANOMALY — Replay Attack:                  ${replayDroneId} & ${replayDrone2Id}`);
  console.log(`  ⚠️  ANOMALY — Quantity Exceeded:              ${quantityDroneId}`);
  console.log(`  ⚠️  ANOMALY — Broken Link:                    ${brokenLinkId}`);
  console.log('');
  console.log('Countries: CA, US, CN, DE, JP, KR, GB, IL, FR, IN, TW, MX, BR, AU, IT');
  console.log('Paste any product ID into the Purchaser UI to see the provenance report.');
}

main().catch((err) => {
  console.error('❌ Seed failed:', err.message);
  process.exit(1);
});
