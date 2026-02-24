import { getOrCreateClientId } from './client-id.js';
import { connectWithClientId } from './ws-client.js';

export async function bootstrap(serverUrl = 'ws://localhost:8787/ws') {
  const clientId = await getOrCreateClientId();
  return connectWithClientId(serverUrl, clientId);
}
