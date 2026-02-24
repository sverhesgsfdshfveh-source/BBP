type CodeCounter = Record<string, number>;

export class Counters {
  wsCloseTotal: CodeCounter = {};
  graceReconnectHitTotal = 0;
  graceExpireTotal = 0;
  clientIdConflictTotal = 0;

  markWsClose(code: number): void {
    const k = String(code);
    this.wsCloseTotal[k] = (this.wsCloseTotal[k] ?? 0) + 1;
  }
}
