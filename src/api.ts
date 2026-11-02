import type {
  ApiError,
  CreateResearchRequest,
  DecisionRequest,
  SystemStatus,
  Task,
} from "./types.ts";

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await response.json().catch(() => null)) as
    | T
    | ApiError
    | null;
  if (!response.ok) {
    const error = body as ApiError | null;
    throw new Error(
      error?.error?.message
        ? `${error.error.message}${error.error.detail ? ` ${error.error.detail}` : ""}`
        : `Request failed with HTTP ${response.status}`,
    );
  }
  return body as T;
}

export async function fetchTasks(): Promise<Task[]> {
  const data = await request<{ tasks: Task[] }>("/api/tasks");
  return data.tasks;
}

export async function fetchSystem(): Promise<SystemStatus> {
  return request<SystemStatus>("/api/system");
}

export async function submitResearch(
  input: CreateResearchRequest,
): Promise<Task> {
  const data = await request<{ task: Task }>("/api/tasks/research", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.task;
}

export async function submitOutreach(
  parentTaskId: string,
  prospectId: string,
): Promise<Task> {
  const data = await request<{ task: Task }>("/api/tasks/outreach", {
    method: "POST",
    body: JSON.stringify({ parentTaskId, prospectId }),
  });
  return data.task;
}

export async function retryTask(id: string): Promise<Task> {
  const data = await request<{ task: Task }>(`/api/tasks/${id}/retry`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.task;
}

export async function decideTask(
  id: string,
  decision: DecisionRequest,
): Promise<Task> {
  const data = await request<{ task: Task }>(`/api/tasks/${id}/decision`, {
    method: "POST",
    body: JSON.stringify(decision),
  });
  return data.task;
}
