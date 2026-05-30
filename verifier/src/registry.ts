import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface AnchorEntry {
  attestation_id: string;
  content_hash: string;
  product_id: string;
}

export interface LoadedRegistries {
  suppliers: Map<string, Uint8Array>; // supplier_id → decoded 32-byte public key
  anchors: Map<string, AnchorEntry>; // attestation_id → {content_hash, product_id}
}

interface SupplierKeysFile {
  version: string;
  keys: Record<string, string>; // supplier_id → base64 public key
}

interface AnchorRegistryFile {
  version: string;
  authority_public_key: string;
  anchors: AnchorEntry[];
}

/**
 * Decode a base64 string into a Uint8Array.
 */
function decodeBase64(base64: string): Uint8Array {
  const binary = Buffer.from(base64, 'base64');
  return new Uint8Array(binary);
}

/**
 * Load and parse registry files from the given directory.
 * Decodes base64 public keys into Uint8Array for tweetnacl.
 * Builds a Map<string, AnchorEntry> for O(1) lookup by attestation_id.
 */
export function loadRegistries(registryDir: string): LoadedRegistries {
  // Load supplier public keys
  const supplierPath = join(registryDir, 'supplier_public_keys.json');
  const supplierRaw = readFileSync(supplierPath, 'utf-8');
  const supplierFile: SupplierKeysFile = JSON.parse(supplierRaw);

  const suppliers = new Map<string, Uint8Array>();
  for (const [supplierId, base64Key] of Object.entries(supplierFile.keys)) {
    suppliers.set(supplierId, decodeBase64(base64Key));
  }

  // Load anchor registry
  const anchorPath = join(registryDir, 'anchor_registry.json');
  const anchorRaw = readFileSync(anchorPath, 'utf-8');
  const anchorFile: AnchorRegistryFile = JSON.parse(anchorRaw);

  const anchors = new Map<string, AnchorEntry>();
  for (const entry of anchorFile.anchors) {
    anchors.set(entry.attestation_id, entry);
  }

  return { suppliers, anchors };
}
