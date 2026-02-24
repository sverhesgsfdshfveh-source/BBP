import WebSocket from 'ws';
import { sendTabSnapshot } from './snapshot.js';
import type { HelloMessage, HeartbeatMessage } from '../shared/protocol.js';

export function connectWithClientId(serverUrl: string, clientId: string): WebSocket {
  const ws = new WebSocket(serverUrl);
  ws.on('open', () => {
    sendHello(ws, clientId);
    sendHeartbeat(ws, clientId);
    void onReconnectSuccess(ws, clientId);
  });
  return ws;
}

export function sendHello(ws: WebSocket, clientId: string): void {
  const msg: HelloMessage = { type: 'hello', clientId, version: '0.1.0', ts: Date.now() };
  ws.send(JSON.stringify(msg));
}

export function sendHeartbeat(ws: WebSocket, clientId: string): void {
  const msg: HeartbeatMessage = { type: 'heartbeat', clientId, ts: Date.now() };
  ws.send(JSON.stringify(msg));
}

export async function onReconnectSuccess(ws: WebSocket, clientId: string): Promise<void> {
  await sendTabSnapshot((msg) => ws.send(JSON.stringify(msg)), clientId);
}
