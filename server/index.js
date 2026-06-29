import 'dotenv/config';
import { createApiServer } from './app.js';

const port = Number(process.env.RT_API_PORT || 8750);
const host = process.env.RT_API_HOST || '127.0.0.1';

createApiServer({ port, host }).then((server) => {
  console.log(`Radiotherapy workflow API listening on http://${server.host}:${server.port}`);
});
