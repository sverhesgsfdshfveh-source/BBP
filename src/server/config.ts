import path from 'node:path';

const day = 24 * 60 * 60 * 1000;

export const config = {
  port: Number(process.env.PORT ?? 8787),
  relay: {
    graceMs: Number(process.env.RELAY_GRACE_MS ?? 90_000),
    expiredClientTtlMs: Number(process.env.RELAY_EXPIRED_CLIENT_TTL_MS ?? 7 * day),
    expiredTabTtlMs: Number(process.env.RELAY_EXPIRED_TAB_TTL_MS ?? day),
    snapshotPath: process.env.RELAY_SNAPSHOT_PATH ?? path.resolve(process.cwd(), 'dist/relay-snapshot.json'),
    snapshotFlushMs: Number(process.env.RELAY_SNAPSHOT_FLUSH_MS ?? 2_000)
  }
};
