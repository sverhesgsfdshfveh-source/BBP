interface PendingRequest {
  resolve: (value: ExecuteInTabResultMessage) => void;
  reject: (reason?: unknown) => void;
  timer: NodeJS.Timeout;
}

export interface ExecuteInTabResultMessage {
  type: 'execute_in_tab_result';
  requestId: string;
  ok: boolean;
  action?: string;
  tabId?: string;
  data?: unknown;
  error?: {
    code?: string;
    message?: string;
    reason?: string;
  };
  meta?: Record<string, unknown>;
}

export class ExecuteInTabBroker {
  private readonly pending = new Map<string, PendingRequest>();

  waitForResult(requestId: string, timeoutMs: number): Promise<ExecuteInTabResultMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error('timeout'));
      }, timeoutMs);
      this.pending.set(requestId, { resolve, reject, timer });
    });
  }

  resolveResult(msg: ExecuteInTabResultMessage): boolean {
    const hit = this.pending.get(msg.requestId);
    if (!hit) return false;
    clearTimeout(hit.timer);
    this.pending.delete(msg.requestId);
    hit.resolve(msg);
    return true;
  }

  rejectAll(reason: Error): void {
    for (const [requestId, hit] of this.pending) {
      clearTimeout(hit.timer);
      this.pending.delete(requestId);
      hit.reject(reason);
    }
  }
}
