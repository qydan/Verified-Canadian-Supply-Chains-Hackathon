// Entry point for the verification backend
import { createApp } from './server.js';
import { initializeDatabase } from './database.js';

const PORT = parseInt(process.env.PORT || '8080', 10);

const db = initializeDatabase();
const app = createApp(db);

app.listen(PORT, () => {
  console.log(`Verification backend listening on port ${PORT}`);
});
