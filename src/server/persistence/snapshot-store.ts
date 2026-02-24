import fs from 'node:fs/promises';
import path from 'node:path';
import type { RelaySnapshot } from '../types.js';
import { relaySnapshotSchema } from './snapshot-schema.js';

export class SnapshotStore {
  private timer?: NodeJS.Timeout;
  constructor(private readonly filePath: string, private readonly flushMs: number) {}

  async loadSnapshot(): Promise<RelaySnapshot | null> {
    try {
      const data = await fs.readFile(this.filePath, 'utf8');
      return relaySnapshotSchema.parse(JSON.parse(data));
    } catch {
      return null;
    }
  }

  async saveSnapshot(state: RelaySnapshot): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(state, null, 2));
  }

  scheduleDebouncedSave(getter: () => RelaySnapshot): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.saveSnapshot(getter());
    }, this.flushMs);
  }
}
