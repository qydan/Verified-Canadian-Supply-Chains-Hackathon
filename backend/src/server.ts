import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { initializeDatabase } from './database.js';
import type Database from 'better-sqlite3';
import attestationsRouter from './routes/attestations.js';
import { createSuppliersRouter } from './routes/suppliers.js';
import verifyRouter from './routes/verify.js';
import productsRouter from './routes/products.js';

/**
 * Checks the nesting depth of a parsed JSON value.
 * Returns the maximum depth found.
 */
function getJsonDepth(value: unknown, currentDepth: number = 1): number {
  if (currentDepth > 20) {
    return currentDepth;
  }

  if (Array.isArray(value)) {
    let maxDepth = currentDepth;
    for (const item of value) {
      if (typeof item === 'object' && item !== null) {
        const depth = getJsonDepth(item, currentDepth + 1);
        if (depth > maxDepth) maxDepth = depth;
        if (maxDepth > 20) return maxDepth;
      }
    }
    return maxDepth;
  }

  if (typeof value === 'object' && value !== null) {
    let maxDepth = currentDepth;
    for (const key of Object.keys(value)) {
      const child = (value as Record<string, unknown>)[key];
      if (typeof child === 'object' && child !== null) {
        const depth = getJsonDepth(child, currentDepth + 1);
        if (depth > maxDepth) maxDepth = depth;
        if (maxDepth > 20) return maxDepth;
      }
    }
    return maxDepth;
  }

  return currentDepth;
}

/**
 * Custom error class for database unavailability.
 */
export class DatabaseUnavailableError extends Error {
  constructor(message: string = 'Database unavailable') {
    super(message);
    this.name = 'DatabaseUnavailableError';
  }
}

/**
 * Creates and configures the Express application with all middleware.
 * Exports the app for use by index.ts and tests.
 */
export function createApp(db?: Database.Database) {
  const app = express();

  // CORS middleware
  app.use(cors());

  // JSON body parsing with 1MB limit
  // Express will return 413 automatically when payload exceeds the limit
  app.use(express.json({ limit: '1mb' }));

  // Nesting depth check middleware (runs after JSON parsing)
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.body && typeof req.body === 'object') {
      const depth = getJsonDepth(req.body);
      if (depth > 20) {
        res.status(400).json({
          error: 'Excessive JSON nesting depth. Maximum allowed depth is 20 levels.',
        });
        return;
      }
    }
    next();
  });

  // Health endpoint
  app.get('/health', (_req: Request, res: Response) => {
    if (!db) {
      res.status(503).json({
        error: 'Service temporarily unavailable: database not initialized',
      });
      return;
    }

    // Check database is accessible
    try {
      db.pragma('journal_mode');
      res.status(200).json({ status: 'ok' });
    } catch {
      res.status(503).json({
        error: 'Service temporarily unavailable: database connection failed',
      });
    }
  });

  // Store db reference on app for route handlers to access
  app.set('db', db);

  // Mount route handlers
  app.use('/suppliers', createSuppliersRouter());
  app.use('/attestations', attestationsRouter);
  app.use('/verify', verifyRouter);
  app.use('/products', productsRouter);

  // Error handling for payload too large (express.json emits this)
  app.use((err: Error & { type?: string; status?: number }, req: Request, res: Response, next: NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({
        error: 'Request payload exceeds the 1MB size limit.',
      });
      return;
    }

    if (err instanceof SyntaxError && err.status === 400) {
      res.status(400).json({
        error: 'Invalid JSON in request body.',
      });
      return;
    }

    // Database unavailability handling
    if (err instanceof DatabaseUnavailableError || err.message?.includes('database')) {
      res.status(503).json({
        error: 'Service temporarily unavailable: temporary backend failure.',
      });
      return;
    }

    next(err);
  });

  // General error handler (catch-all)
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    // Check for database-related errors
    if (
      err.message?.toLowerCase().includes('database') ||
      err.message?.toLowerCase().includes('sqlite')
    ) {
      res.status(503).json({
        error: 'Service temporarily unavailable: temporary backend failure.',
      });
      return;
    }

    res.status(500).json({
      error: 'Internal server error.',
    });
  });

  return app;
}
