import { useState } from "react";
import {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  useCreatePat,
  usePersonalAccessTokens,
  useRevokePat,
} from "@/features/credentials/hooks";

// Pola credential C.14: create mengembalikan secret/token SEKALI tampil;
// setelah itu hanya metadata. API Keys = Project Settings; PAT = User Settings.
function CredentialPanel({
  ariaLabel,
  listQuery,
  onCreate,
  onRevoke,
  creating,
  revoking,
  error,
  createdSecret,
  secretLabel,
  idPrefix,
}: {
  ariaLabel: string;
  listQuery: { data?: Array<{ id: string; name: string; createdAt: string }> | undefined; isLoading: boolean };
  onCreate: (name: string) => void;
  onRevoke: (id: string) => void;
  creating: boolean;
  revoking: boolean;
  error?: string | null;
  createdSecret: { name: string; value: string } | null;
  secretLabel: string;
  idPrefix: string;
}) {
  const [name, setName] = useState("");

  return (
    <section aria-label={ariaLabel} className="flex flex-col gap-3 p-4">
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name);
          setName("");
        }}
        noValidate
      >
        <label className="text-xs text-muted-foreground">
          Nama
          <input
            name="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {creating ? "Membuat..." : "Buat"}
        </button>
      </form>

      {createdSecret ? (
        <div role="status" className="rounded-md bg-warning/15 px-3 py-2 text-sm">
          <strong>{createdSecret.name}</strong> — {secretLabel} (jangan hilang, hanya tampil sekali):{" "}
          <code>{createdSecret.value}</code>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th className="py-1 pr-3 font-medium">Nama</th>
            <th className="py-1 pr-3 font-medium">Dibuat</th>
            <th className="py-1 font-medium">Aksi</th>
          </tr>
        </thead>
        <tbody>
          {(listQuery.data ?? []).map((item) => (
            <tr key={item.id}>
              <td className="py-1 pr-3">{item.name}</td>
              <td className="py-1 pr-3 text-muted-foreground">
                {new Date(item.createdAt).toLocaleDateString("id-ID")}
              </td>
              <td className="py-1">
                <button
                  type="button"
                  data-testid={`${idPrefix}-revoke-${item.id}`}
                  onClick={() => onRevoke(item.id)}
                  disabled={revoking}
                  className="rounded border border-input px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
                >
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ApiKeysPanel({ projectId }: { projectId: string }) {
  const listQuery = useApiKeys(projectId);
  const create = useCreateApiKey(projectId);
  const revoke = useRevokeApiKey(projectId);
  const [secret, setSecret] = useState<{ name: string; value: string } | null>(null);

  return (
    <>
      <CredentialPanel
        ariaLabel="API Keys"
        listQuery={listQuery}
        creating={create.isPending}
        revoking={revoke.isPending}
        error={
          create.error instanceof Error ? `${(create.error as { code?: string }).code ?? ""} ${create.error.message}` : null
        }
        createdSecret={secret}
        secretLabel="API Key"
        idPrefix="apikey"
        onCreate={(name) =>
          create.mutate(
            { name },
            {
              onSuccess: (data) =>
                setSecret({ name, value: (data as unknown as { secret: string }).secret }),
            },
          )
        }
        onRevoke={(id) => revoke.mutate(id)}
      />
    </>
  );
}

export function PatPanel() {
  const listQuery = usePersonalAccessTokens();
  const create = useCreatePat();
  const revoke = useRevokePat();
  const [token, setToken] = useState<{ name: string; value: string } | null>(null);

  return (
    <CredentialPanel
      ariaLabel="Personal Access Tokens"
      listQuery={listQuery}
      creating={create.isPending}
      revoking={revoke.isPending}
      error={create.error instanceof Error ? create.error.message : null}
      createdSecret={token}
      secretLabel="Token"
      idPrefix="pat"
      onCreate={(name) =>
        create.mutate(
          { name },
          {
            onSuccess: (data) =>
              setToken({ name, value: (data as unknown as { token: string }).token }),
          },
        )
      }
      onRevoke={(id) => revoke.mutate(id)}
    />
  );
}
