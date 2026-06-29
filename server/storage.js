import fs from 'node:fs/promises';
import path from 'node:path';
import { createDefaultStore } from './domain/defaultData.js';

export class JsonStore {
  constructor({ dataDir }) {
    this.dataDir = dataDir || path.join(process.cwd(), 'data');
    this.storePath = path.join(this.dataDir, 'store.json');
    this.backupDir = path.join(this.dataDir, 'backups');
    this.writeQueue = Promise.resolve();
  }

  async init() {
    await fs.mkdir(this.dataDir, { recursive: true });
    await fs.mkdir(this.backupDir, { recursive: true });

    try {
      await fs.access(this.storePath);
    } catch {
      await this.write(createDefaultStore());
    }
  }

  async read() {
    const raw = await fs.readFile(this.storePath, 'utf8');
    return JSON.parse(raw);
  }

  async write(store) {
    // Serialize writes so concurrent API requests cannot interleave JSON output.
    this.writeQueue = this.writeQueue.then(async () => {
      await fs.mkdir(this.dataDir, { recursive: true });
      await fs.writeFile(this.storePath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    });

    await this.writeQueue;
    return store;
  }

  async update(mutator) {
    const store = await this.read();
    const next = await mutator(store);
    await this.write(next || store);
    return next || store;
  }

  async backup(label) {
    const store = await this.read();
    const safeLabel = String(label || 'snapshot').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.backupDir, `${stamp}-${safeLabel}.json`);
    await fs.writeFile(backupPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
    return backupPath;
  }
}
