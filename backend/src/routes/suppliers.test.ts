import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import http from 'http';
import { createApp } from '../server.js';
import { initializeDatabase } from '../database.js';
import type Database from 'better-sqlite3';

function makeRequest(
  app: express.Express,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('Failed to get server address'));
        return;
      }
      const port = addr.port;
      const options: http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: { 'Content-Type': 'application/json' },
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          let parsed: unknown;
          try { parsed = JSON.parse(data); } catch { parsed = data; }
          server.close();
          resolve({ status: res.statusCode!, body: parsed });
        });
      });

      req.on('error', (err) => { server.close(); reject(err); });

      if (body !== undefined) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  });
}

describe('Supplier Registry Endpoints', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeAll(() => {
    db = initializeDatabase(':memory:');
    app = createApp(db);
  });

  afterAll(() => {
    db.close();
  });

  beforeEach(() => {
    db.exec('DELETE FROM suppliers');
  });

  describe('POST /suppliers', () => {
    it('registers a valid supplier and returns 201 with complete record', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Acme Corp',
        publicKey: 'a'.repeat(64),
        location: 'CA',
      });

      expect(res.status).toBe(201);
      const supplier = res.body as any;
      expect(supplier.id).toBeDefined();
      expect(supplier.name).toBe('Acme Corp');
      expect(supplier.publicKey).toBe('a'.repeat(64));
      expect(supplier.location).toBe('CA');
      expect(supplier.registeredAt).toBeDefined();
      expect(supplier.isActive).toBe(true);
    });

    it('returns 400 when name is missing', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        publicKey: 'a'.repeat(64),
        location: 'CA',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('name');
    });

    it('returns 400 when name is empty string', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: '',
        publicKey: 'a'.repeat(64),
        location: 'CA',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('name');
    });

    it('returns 400 when name exceeds 200 characters', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'x'.repeat(201),
        publicKey: 'a'.repeat(64),
        location: 'CA',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('name');
    });

    it('returns 400 when publicKey is not 64 hex chars', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Test',
        publicKey: 'abc',
        location: 'CA',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('publicKey');
    });

    it('returns 400 when publicKey contains non-hex characters', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Test',
        publicKey: 'g'.repeat(64),
        location: 'CA',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('publicKey');
    });

    it('returns 400 when location is not a valid ISO alpha-2 code', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Test',
        publicKey: 'a'.repeat(64),
        location: 'canada',
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('location');
    });

    it('returns 400 when location is missing', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Test',
        publicKey: 'a'.repeat(64),
      });
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('location');
    });

    it('returns 409 when publicKey is already registered', async () => {
      const key = 'b'.repeat(64);
      await makeRequest(app, 'POST', '/suppliers', {
        name: 'First',
        publicKey: key,
        location: 'CA',
      });

      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Second',
        publicKey: key,
        location: 'US',
      });
      expect(res.status).toBe(409);
      expect((res.body as any).error).toContain('already');
    });

    it('accepts name with exactly 200 characters', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'x'.repeat(200),
        publicKey: 'c'.repeat(64),
        location: 'US',
      });
      expect(res.status).toBe(201);
    });

    it('accepts publicKey with uppercase hex characters', async () => {
      const res = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Test',
        publicKey: 'ABCDEF1234567890'.repeat(4),
        location: 'CA',
      });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /suppliers', () => {
    it('returns empty array when no suppliers exist', async () => {
      const res = await makeRequest(app, 'GET', '/suppliers');
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it('returns all registered suppliers', async () => {
      await makeRequest(app, 'POST', '/suppliers', {
        name: 'Supplier A',
        publicKey: 'a'.repeat(64),
        location: 'CA',
      });
      await makeRequest(app, 'POST', '/suppliers', {
        name: 'Supplier B',
        publicKey: 'b'.repeat(64),
        location: 'US',
      });

      const res = await makeRequest(app, 'GET', '/suppliers');
      expect(res.status).toBe(200);
      const suppliers = res.body as any[];
      expect(suppliers).toHaveLength(2);
      expect(suppliers[0].name).toBe('Supplier A');
      expect(suppliers[1].name).toBe('Supplier B');
      // Verify all fields are present
      for (const s of suppliers) {
        expect(s.id).toBeDefined();
        expect(s.name).toBeDefined();
        expect(s.publicKey).toBeDefined();
        expect(s.location).toBeDefined();
        expect(s.registeredAt).toBeDefined();
        expect(s.isActive).toBe(true);
      }
    });
  });

  describe('GET /suppliers/:id', () => {
    it('returns the supplier when found', async () => {
      const createRes = await makeRequest(app, 'POST', '/suppliers', {
        name: 'Found Me',
        publicKey: 'd'.repeat(64),
        location: 'CA',
      });
      const created = createRes.body as any;

      const res = await makeRequest(app, 'GET', `/suppliers/${created.id}`);
      expect(res.status).toBe(200);
      const supplier = res.body as any;
      expect(supplier.id).toBe(created.id);
      expect(supplier.name).toBe('Found Me');
      expect(supplier.publicKey).toBe('d'.repeat(64));
      expect(supplier.location).toBe('CA');
      expect(supplier.registeredAt).toBeDefined();
      expect(supplier.isActive).toBe(true);
    });

    it('returns 404 when supplier does not exist', async () => {
      const res = await makeRequest(app, 'GET', '/suppliers/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(404);
      expect((res.body as any).error).toContain('not found');
    });
  });
});
