/**
 * TASK-6.6.1 — Request context (AsyncLocalStorage) untuk structured logging
 * F.4. Middleware apps/api membuka context per-request; lapisan bawah
 * (pipeline/identity) mengisi field (`user_id`, `project_id`) tanpa
 * perubahan signature. Di luar context, setter menjadi no-op aman.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export interface RequestLogStore {
  requestId: string;
  userId?: string;
  projectId?: string;
}

const als = new AsyncLocalStorage<RequestLogStore>();

export function runWithRequestContext<T>(store: RequestLogStore, fn: () => Promise<T>): Promise<T> {
  return als.run(store, fn);
}

/** Ambil snapshot store aktif (atau undefined di luar context). */
export function getRequestLogStore(): RequestLogStore | undefined {
  return als.getStore();
}

/** Set field pada store aktif — aman dipanggil dari mana saja (no-op bila tanpa context). */
export function setRequestLogFields(fields: Partial<Omit<RequestLogStore, "requestId">>): void {
  const store = als.getStore();
  if (!store) return;
  if (fields.userId !== undefined) store.userId = fields.userId;
  if (fields.projectId !== undefined) store.projectId = fields.projectId;
}
