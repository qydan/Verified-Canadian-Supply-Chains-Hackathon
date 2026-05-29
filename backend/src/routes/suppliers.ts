import { Router, Request, Response } from 'express';
import { randomUUID } from 'crypto';
import type Database from 'better-sqlite3';
import type { Supplier } from '../types.js';

/**
 * Valid ISO 3166-1 alpha-2 country codes.
 * Two uppercase letters.
 */
const ISO_ALPHA2_REGEX = /^[A-Z]{2}$/;

/**
 * Valid public key: exactly 64 hex characters (representing 32 bytes).
 */
const PUBLIC_KEY_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Creates the suppliers router with all supplier registry endpoints.
 */
export function createSuppliersRouter(): Router {
  const router = Router();

  // POST /suppliers - Register a new supplier
  router.post('/', (req: Request, res: Response) => {
    const db = req.app.get('db') as Database.Database | undefined;
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    const { name, publicKey, location } = req.body;

    // Validate name
    if (!name || typeof name !== 'string' || name.length < 1 || name.length > 200) {
      res.status(400).json({ error: 'Invalid field: name must be between 1 and 200 characters' });
      return;
    }

    // Validate publicKey
    if (!publicKey || typeof publicKey !== 'string' || !PUBLIC_KEY_REGEX.test(publicKey)) {
      res.status(400).json({ error: 'Invalid field: publicKey must be exactly 64 hex characters' });
      return;
    }

    // Validate location
    if (!location || typeof location !== 'string' || !ISO_ALPHA2_REGEX.test(location)) {
      res.status(400).json({ error: 'Invalid field: location must be a valid ISO 3166-1 alpha-2 country code' });
      return;
    }

    // Check for duplicate publicKey
    const existing = db.prepare('SELECT id FROM suppliers WHERE public_key = ?').get(publicKey);
    if (existing) {
      res.status(409).json({ error: 'A supplier with this publicKey is already registered' });
      return;
    }

    const id = randomUUID();
    const registeredAt = new Date().toISOString();
    const isActive = true;

    db.prepare(
      'INSERT INTO suppliers (id, name, public_key, location, registered_at, is_active) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, name, publicKey, location, registeredAt, isActive ? 1 : 0);

    const supplier: Supplier = {
      id,
      name,
      publicKey,
      location,
      registeredAt,
      isActive,
    };

    res.status(201).json(supplier);
  });

  // GET /suppliers - List all suppliers
  router.get('/', (req: Request, res: Response) => {
    const db = req.app.get('db') as Database.Database | undefined;
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    const rows = db.prepare('SELECT * FROM suppliers').all() as Array<{
      id: string;
      name: string;
      public_key: string;
      location: string;
      registered_at: string;
      is_active: number;
    }>;

    const suppliers: Supplier[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
      location: row.location,
      registeredAt: row.registered_at,
      isActive: row.is_active === 1,
    }));

    res.status(200).json(suppliers);
  });

  // GET /suppliers/:id - Get supplier by ID
  router.get('/:id', (req: Request, res: Response) => {
    const db = req.app.get('db') as Database.Database | undefined;
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    const row = db.prepare('SELECT * FROM suppliers WHERE id = ?').get(req.params.id) as {
      id: string;
      name: string;
      public_key: string;
      location: string;
      registered_at: string;
      is_active: number;
    } | undefined;

    if (!row) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    const supplier: Supplier = {
      id: row.id,
      name: row.name,
      publicKey: row.public_key,
      location: row.location,
      registeredAt: row.registered_at,
      isActive: row.is_active === 1,
    };

    res.status(200).json(supplier);
  });

  // GET /suppliers/:id/attestations - Get all attestations by a supplier
  router.get('/:id/attestations', (req: Request, res: Response) => {
    const db = req.app.get('db') as Database.Database | undefined;
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }

    const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ?').get(req.params.id);
    if (!supplier) {
      res.status(404).json({ error: 'Supplier not found' });
      return;
    }

    const rows = db.prepare(`
      SELECT id, product_name, product_id, location, timestamp,
             is_transformation, material_cost, labour_cost, output_quantity, output_unit
      FROM attestations WHERE supplier_id = ?
      ORDER BY timestamp DESC
    `).all(req.params.id) as Array<{
      id: string;
      product_name: string;
      product_id: string;
      location: string;
      timestamp: string;
      is_transformation: number;
      material_cost: number;
      labour_cost: number;
      output_quantity: number;
      output_unit: string;
    }>;

    const attestations = rows.map((r) => ({
      id: r.id,
      productName: r.product_name,
      productId: r.product_id,
      location: r.location,
      timestamp: r.timestamp,
      isTransformation: r.is_transformation === 1,
      materialCost: r.material_cost,
      labourCost: r.labour_cost,
      outputQuantity: r.output_quantity,
      outputUnit: r.output_unit,
    }));

    res.status(200).json(attestations);
  });

  return router;
}
