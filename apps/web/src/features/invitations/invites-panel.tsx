import { type FormEvent, useState } from "react";
import { useCreateInvitation, useRevokeInvitation } from "@/features/invitations/hooks";
import { usePermissionGroups, useInvitations, isPendingInvitation } from "@/features/members/hooks";

const SCOPES = ["project", "milestone", "board", "list", "card"] as const;

// Invite UI (7.10.2): Email + Permission Group + hierarchy scope wajib.
// Create/revoke memakai domain endpoint C.13; accept terjadi di sisi invitee.
export function InvitesPanel({ projectId }: { projectId: string }) {
  const createMutation = useCreateInvitation(projectId);
  const revokeMutation = useRevokeInvitation(projectId);
  const invitationsQuery = useInvitations(projectId);
  const groupsQuery = usePermissionGroups(projectId);

  const [email, setEmail] = useState("");
  const [groupId, setGroupId] = useState("");
  const [scopeType, setScopeType] = useState<(typeof SCOPES)[number]>("project");
  const [scopeId, setScopeId] = useState("");

  const pending = (invitationsQuery.data ?? []).filter((i) => isPendingInvitation(i));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!groupId) return;
    createMutation.mutate(
      { email, groupId, scopeType, scopeId: scopeType === "project" ? "" : scopeId },
      { onSuccess: () => setEmail("") },
    );
  }

  return (
    <section aria-label="Undangan" className="flex flex-col gap-4 p-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <label className="text-xs text-muted-foreground">
          Email
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-muted-foreground">
          Group
          <select
            name="group"
            required
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="" disabled>
              Pilih…
            </option>
            {(groupsQuery.data ?? []).map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-muted-foreground">
          Scope
          <select
            name="scope"
            value={scopeType}
            onChange={(e) => setScopeType(e.target.value as (typeof SCOPES)[number])}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {SCOPES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        {scopeType !== "project" ? (
          <input
            aria-label="Scope ID"
            placeholder="ID entity scope"
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          />
        ) : null}
        <button
          type="submit"
          disabled={createMutation.isPending || !email || !groupId}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {createMutation.isPending ? "Mengirim..." : "Undang"}
        </button>
      </form>

      {createMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {createMutation.error instanceof Error
            ? `${(createMutation.error as { code?: string }).code ?? "ERROR"} — ${createMutation.error.message}`
            : "Gagal mengirim undangan."}
        </p>
      ) : null}

      <ul aria-label="Daftar undangan pending" className="flex flex-col gap-1">
        {pending.map((i) => (
          <li key={i.id} data-invitation-id={i.id} className="flex items-center gap-3 text-sm">
            <span>{i.email}</span>
            <span className="text-xs text-muted-foreground">
              exp {new Date(i.expiresAt).toLocaleDateString("id-ID")}
            </span>
            <button
              type="button"
              onClick={() => revokeMutation.mutate(i.id)}
              disabled={revokeMutation.isPending}
              className="rounded border border-input px-2 py-0.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              Cabut
            </button>
          </li>
        ))}
      </ul>
      {revokeMutation.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Gagal mencabut undangan.
        </p>
      ) : null}
    </section>
  );
}
