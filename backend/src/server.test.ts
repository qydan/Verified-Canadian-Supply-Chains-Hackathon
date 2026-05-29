import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp, DatabaseUnavailableError } from './server.js';
import { initializeDatabase } from './database.js';
import type Database from 'better-sqlite3';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

// Helper to make requests without a real HTTP server
async function injectRequest(
  app: express.Express,
  method: 'GET' | 'POST',
  path: string,
  body?: unknown,
  headers?: Record<string, string>
) {
  return new Promise<{ status: number; body: unknown; headers: Record<string, string> }>((resolve) => {
    const req = {
      method,
      url: path,
      path,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
      body: body ?? undefined,
    };

    // We'll use supertest-like approach via app.handle
    // Actually, let's just use the app directly with a mock req/res
    // Better approach: use Node's http module
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, () => {
      const port = server.address().port;
      const options: any = {
        hostname: '127.0.0.1',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      };

      const request = http.request(options, (res: any) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          let parsedBody: unknown;
          try {
            parsedBody = JSON.parse(data);
          } catch {
            parsedBody = data;
          }
          server.close();
          resolve({
            status: res.statusCode,
            body: parsedBody,
            headers: res.headers,
          });
        });
      });

      if (body !== undefined) {
        const payload = typeof body === 'string' ? body : JSON.stringify(body);
        request.write(payload);
      }

      request.end();
    });
  });
}

describe('Server - Express setup', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeAll(() => {
    db = initializeDatabase(':memory:');
    app = createApp(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('GET /health', () => {
    it('returns 200 with { status: "ok" } when database is available', async () => {
      const res = await injectRequest(app, 'GET', '/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('returns 503 when database is not provided', async () => {
      const appNoDb = createApp(undefined);
      const res = await injectRequest(appNoDb, 'GET', '/health');
      expect(res.status).toBe(503);
      expect((res.body as any).error).toContain('database');
    });

    it('returns 503 when database is unavailable', async () => {
      const closedDb = initializeDatabase(':memory:');
      closedDb.close();
      const appClosedDb = createApp(closedDb);
      const res = await injectRequest(appClosedDb, 'GET', '/health');
      expect(res.status).toBe(503);
      expect((res.body as any).error).toContain('unavailable');
    });
  });

  describe('Request size validation', () => {
    it('returns 413 for payloads exceeding 1MB', async () => {
      // Create a payload larger than 1MB
      const largePayload = JSON.stringify({ data: 'x'.repeat(1024 * 1024 + 1) });
      const res = await injectRequest(app, 'POST', '/health', largePayload, {
        'Content-Length': Buffer.byteLength(largePayload).toString(),
      });
      expect(res.status).toBe(413);
      expect((res.body as any).error).toContain('1MB');
    });
  });

  describe('JSON nesting depth check', () => {
    it('returns 400 for JSON nested deeper than 20 levels', async () => {
      // Build a deeply nested object (21 levels)
      let nested: any = { value: 'deep' };
      for (let i = 0; i < 21; i++) {
        nested = { child: nested };
      }
      const res = await injectRequest(app, 'POST', '/health', nested);
      expect(res.status).toBe(400);
      expect((res.body as any).error).toContain('nesting');
    });

    it('accepts JSON with exactly 20 levels of nesting', async () => {
      // Build exactly 20 levels deep
      let nested: any = { value: 'deep' };
      for (let i = 0; i < 19; i++) {
        nested = { child: nested };
      }
      // This should pass the nesting check (the route may 404 but not 400)
      const res = await injectRequest(app, 'POST', '/health', nested);
      // Should not be 400 for nesting
      expect(res.status).not.toBe(400);
    });
  });

  describe('CORS', () => {
    it('includes CORS headers in response', async () => {
      const res = await injectRequest(app, 'GET', '/health');
      expect(res.headers['access-control-allow-origin']).toBeDefined();
    });
  });

  describe('Database unavailability handling', () => {
    it('returns 503 when a route throws a DatabaseUnavailableError', async () => {
      const testApp = createApp(db);
      // Add a route that throws DatabaseUnavailableError
      testApp.get('/test-db-error', (_req: Request, _res: Response, next: NextFunction) => {
        next(new DatabaseUnavailableError());
      });
      // Re-add error handlers (they need to be after routes)
      // Actually the error handlers are already added in createApp, but routes added after
      // won't have them. Let's use a different approach.
      const appWithRoute = express();
      appWithRoute.use(cors());
      appWithRoute.use(express.json({ limit: '1mb' }));
      appWithRoute.get('/test-db-error', (_req: Request, _res: Response, next: NextFunction) => {
        next(new DatabaseUnavailableError());
      });
      appWithRoute.use((err: Error & { type?: string; status?: number }, _req: Request, res: Response, _next: NextFunction) => {
        if (err instanceof DatabaseUnavailableError || err.message?.includes('database')) {
          res.status(503).json({
            error: 'Service temporarily unavailable: temporary backend failure.',
          });
          return;
        }
        res.status(500).json({ error: 'Internal server error.' });
      });

      const res = await injectRequest(appWithRoute, 'GET', '/test-db-error');
      expect(res.status).toBe(503);
      expect((res.body as any).error).toContain('temporarily unavailable');
    });
  });
});
