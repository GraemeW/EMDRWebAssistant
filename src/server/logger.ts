// Structured event log: one JSON object per line (timestamp + event name +* whatever details are relevant)
// Written to stdout

export interface ServerLogger { log(event: string, details?: Record<string, unknown>): void; }

export function createLogger(): ServerLogger {
  return {
    log(event: string, details: Record<string, unknown> = {}): void {
      console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...details }));
    },
  };
}
