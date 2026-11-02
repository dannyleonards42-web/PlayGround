import { promises as fs } from "node:fs";
import path from "node:path";
import type { Task } from "../shared/types.ts";

interface PersistedState {
  version: 1;
  tasks: Task[];
}

/**
 * File-backed task store. Writes are serialized and atomic (write + rename).
 * A null file path creates an in-memory store for tests.
 */
export class TaskStore {
  private tasks = new Map<string, Task>();
  private writeChain: Promise<void> = Promise.resolve();
  private loaded = false;

  constructor(private readonly filePath: string | null) {}

  async init(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.filePath) return;
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as PersistedState;
      if (parsed.version !== 1 || !Array.isArray(parsed.tasks)) {
        throw new Error("Unsupported HQ state file format");
      }
      for (const task of parsed.tasks) this.tasks.set(task.id, task);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      await this.persist();
    }
  }

  list(): Task[] {
    return [...this.tasks.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((task) => structuredClone(task));
  }

  get(id: string): Task | null {
    const task = this.tasks.get(id);
    return task ? structuredClone(task) : null;
  }

  async upsert(task: Task): Promise<Task> {
    this.tasks.set(task.id, structuredClone(task));
    await this.persist();
    return structuredClone(task);
  }

  async readFromDisk(id: string): Promise<Task | null> {
    if (!this.filePath) {
      const task = this.tasks.get(id);
      return task ? structuredClone(task) : null;
    }
    await this.writeChain;
    const raw = await fs.readFile(this.filePath, "utf8");
    const parsed = JSON.parse(raw) as PersistedState;
    return parsed.tasks.find((task) => task.id === id) ?? null;
  }

  private persist(): Promise<void> {
    const serialized = JSON.stringify(
      {
        version: 1,
        tasks: this.list(),
      } satisfies PersistedState,
      null,
      2,
    );
    this.writeChain = this.writeChain.then(async () => {
      if (!this.filePath) return;
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${process.pid}.tmp`;
      await fs.writeFile(tmp, serialized, "utf8");
      await fs.rename(tmp, this.filePath);
    });
    return this.writeChain;
  }
}
