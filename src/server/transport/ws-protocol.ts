import type { RelayIncomingMessage } from '../../extension/shared/protocol.js';

export function validateHello(msg: RelayIncomingMessage): { ok: boolean; reason?: string } {
  if (msg.type !== 'hello') return { ok: false, reason: 'first message must be hello' };
  if (!msg.clientId) return { ok: false, reason: 'missing clientId' };
  return { ok: true };
}

export function parseRelayEvent(raw: string): RelayIncomingMessage {
  return JSON.parse(raw) as RelayIncomingMessage;
}
