import type { ConnectionState } from '../types.js';

export class ConnectionManager {
  private readonly connections = new Map<string, ConnectionState>();

  registerConnection(connId: string, clientId: string, meta: Record<string, unknown> | undefined, now: number): ConnectionState {
    const conn: ConnectionState = { connId, clientId, connectedAt: now, meta };
    this.connections.set(connId, conn);
    return conn;
  }

  unregisterConnection(connId: string): ConnectionState | undefined {
    const conn = this.connections.get(connId);
    this.connections.delete(connId);
    return conn;
  }

  bindConnectionToClient(connId: string, clientId: string): void {
    const conn = this.connections.get(connId);
    if (conn) conn.clientId = clientId;
  }

  get(connId: string): ConnectionState | undefined {
    return this.connections.get(connId);
  }

  size(): number { return this.connections.size; }
}
