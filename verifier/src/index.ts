import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistries } from './registry.js';
import { createApp } from './server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const registryDir = join(__dirname, '..', 'registry');

const PORT = 8000;

// Load registries once at startup
const registries = loadRegistries(registryDir);
console.log(
  `Loaded ${registries.suppliers.size} supplier keys and ${registries.anchors.size} anchor entries`
);

// Create and start the Express app
const app = createApp(registries);

app.listen(PORT, () => {
  console.log(`Verifier service listening on port ${PORT}`);
});
