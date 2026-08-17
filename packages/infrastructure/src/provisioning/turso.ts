const API = "https://api.turso.tech/v1";

export interface TursoEnv {
  org: string;
  group: string;
  apiToken: string;
}

export interface CreatedDatabase {
  name: string;
  hostname: string;
}

async function api<T>(env: TursoEnv, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.apiToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) throw new Error(`Turso API ${res.status} ${path}: ${await res.text()}`);
  return (await res.json()) as T;
}

export async function createDatabase(env: TursoEnv, name: string): Promise<CreatedDatabase> {
  const body = await api<{ database: { Hostname: string } }>(
    env,
    `/organizations/${env.org}/databases?group=${env.group}`,
    { method: "POST", body: JSON.stringify({ name, group: env.group }) },
  );
  return { name, hostname: body.database.Hostname };
}

export async function mintDatabaseToken(env: TursoEnv, name: string, expiration = "1y"): Promise<string> {
  const body = await api<{ jwt: string }>(env, `/databases/${name}/auth/tokens`, {
    method: "POST",
    body: JSON.stringify({ expiration }),
  });
  return body.jwt;
}

export async function deleteDatabase(env: TursoEnv, name: string): Promise<void> {
  await api<{ database?: unknown }>(env, `/organizations/${env.org}/databases/${name}`, { method: "DELETE" });
}

export function projectDatabaseName(projectId: string): string {
  return `proj-${projectId.toLowerCase().replace(/[^a-z0-9-]/g, "")}`;
}