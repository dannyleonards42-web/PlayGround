import type { Response } from "express";
import type { Task } from "../shared/types.ts";

/**
 * Server-sent-events fan-out. Sends the full task on every mutation so clients
 * never have to infer whether an update is real.
 */
export class HqBus {
  private clients = new Set<Response>();

  subscribe(res: Response): () => void {
    this.clients.add(res);
    return () => this.clients.delete(res);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  broadcastTask(task: Task): number {
    const payload = `event: task\ndata: ${JSON.stringify(task)}\n\n`;
    let delivered = 0;
    for (const client of this.clients) {
      try {
        client.write(payload);
        delivered += 1;
      } catch {
        this.clients.delete(client);
      }
    }
    return delivered;
  }

  broadcastSystem(data: unknown): void {
    const payload = `event: system\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.clients) {
      try {
        client.write(payload);
      } catch {
        this.clients.delete(client);
      }
    }
  }

  closeAll(): void {
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}
