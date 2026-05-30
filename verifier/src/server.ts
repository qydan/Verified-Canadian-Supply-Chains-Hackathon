import express, { type Express, type Request, type Response } from 'express';
import { type LoadedRegistries } from './registry.js';
import { parseVerifyRequest } from './parse.js';
import { verifyChain } from './verify.js';

/**
 * Create an Express app with /verify and /health routes.
 * Accepts registries as a parameter for testability.
 */
export function createApp(registries: LoadedRegistries): Express {
  const app = express();

  app.use(express.json());

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });

  // Verify endpoint
  app.post('/verify', (req: Request, res: Response) => {
    try {
      const parsed = parseVerifyRequest(req.body);

      if (!parsed.success) {
        res.status(400).json({ error: parsed.error });
        return;
      }

      const response = verifyChain(parsed.data, registries);
      res.status(200).json(response);
    } catch (err) {
      console.error('Internal server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  return app;
}
