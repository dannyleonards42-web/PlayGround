import { randomUUID } from "node:crypto";

export function taskId(): string {
  return `TSK-${randomUUID().split("-")[0].toUpperCase()}`;
}

export function eventId(): string {
  return `EVT-${randomUUID().split("-")[0].toUpperCase()}`;
}

export function prospectId(index: number): string {
  return `PRS-${String(index + 1).padStart(2, "0")}-${randomUUID()
    .split("-")[0]
    .toUpperCase()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
