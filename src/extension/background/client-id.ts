import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const fallbackStorePath = path.resolve(process.cwd(), 'dist/extension-client-id.json');

export async function getOrCreateClientId(): Promise<string> {
  try {
    const txt = await fs.readFile(fallbackStorePath, 'utf8');
    const parsed = JSON.parse(txt) as { clientId?: string };
    if (parsed.clientId) return parsed.clientId;
  } catch {}
  const clientId = crypto.randomUUID();
  await fs.mkdir(path.dirname(fallbackStorePath), { recursive: true });
  await fs.writeFile(fallbackStorePath, JSON.stringify({ clientId }, null, 2));
  return clientId;
}
