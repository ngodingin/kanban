import { type FormEvent, useState } from "react";
import { useMembers } from "@/features/members/hooks";
import {
  usePermissions,
  usePermissionGroupsList,
  useCreatePermissionGroup,
  useUpdatePermissionGroup,
  useDeletePermissionGroup,
  useGroupAssignments,
  useCreateGroupAssignment,
  useRevokeGroupAssignment,
  useDirectPermissionAssignments,
  useCreateDirectPermissionAssignment,
  useRevokeDirectPermissionAssignment,
  SCOPES,
  type Permission,
  type PermissionGroup,
  type GroupAssignment,
  type PermissionAssignment,
} from "./hooks";

const CARD_READ_VISIBILITIES = ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"] as const;
type CardReadVisibility = (typeof CARD_READ_VISIBILITIES)[number];

interface PermissionGroupsEditorProps {
  projectId: string;
}

export function PermissionGroupsEditor({ projectId }: PermissionGroupsEditorProps) {
  const permissionsQuery = usePermissions(projectId);
  const groupsQuery = usePermissionGroupsList(projectId);
  const membersQuery = useMembers(projectId);
  const createMutation = useCreatePermissionGroup(projectId);
  const updateMutation = useUpdatePermissionGroup(projectId);
  const deleteMutation = useDeletePermissionGroup(projectId);
  const createAssignmentMutation = useCreateGroupAssignment(projectId);
  const revokeAssignmentMutation = useRevokeGroupAssignment(projectId);
  const createDirectPermissionMutation = useCreateDirectPermissionAssignment(projectId);
  const revokeDirectPermissionMutation = useRevokeDirectPermissionAssignment(projectId);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPermissions, setNewGroupPermissions] = useState<string[]>([]);
  const [newGroupVisibility, setNewGroupVisibility] = useState<CardReadVisibility>("CREATED_BY_ME");
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupPermissions, setEditGroupPermissions] = useState<string[]>([]);
  const [editGroupVisibility, setEditGroupVisibility] = useState<CardReadVisibility>("CREATED_BY_ME");

  // Group Assignment state
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [assignGroupId, setAssignGroupId] = useState("");
  const [assignScopeType, setAssignScopeType] = useState<(typeof SCOPES)[number]>("project");
  const [assignScopeId, setAssignScopeId] = useState("");

  // Direct Permission state
  const [directPermPermissionId, setDirectPermPermissionId] = useState("");
  const [directPermScopeType, setDirectPermScopeType] = useState<(typeof SCOPES)[number]>("project");
  const [directPermScopeId, setDirectPermScopeId] = useState("");
  const [directPermVisibility, setDirectPermVisibility] = useState<CardReadVisibility>("CREATED_BY_ME");

  const permissions = permissionsQuery.data ?? [];
  const groups = groupsQuery.data ?? [];
  const members = membersQuery.data ?? [];
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);
  const assignmentsQuery = useGroupAssignments(projectId, selectedMembershipId ?? undefined);
  const assignments = assignmentsQuery.data ?? [];
  const directPermAssignmentsQuery = useDirectPermissionAssignments(projectId, selectedMembershipId ?? undefined);
  const directPermAssignments = directPermAssignmentsQuery.data ?? [];

  function findCardReadPermission(): Permission | undefined {
    return permissions.find((p) => p.key === "card.read");
  }

  function handleSelectGroup(group: PermissionGroup) {
    setSelectedGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupPermissions(group.permissions.map((p) => p.permissionId));
    // Load existing visibility for card.read
    const cardReadEntry = group.permissions.find((p) => p.key === "card.read");
    setEditGroupVisibility((cardReadEntry?.cardReadVisibility as CardReadVisibility) ?? "CREATED_BY_ME");
    setIsCreating(false);
  }

  function handleStartCreate() {
    setIsCreating(true);
    setSelectedGroupId(null);
    setNewGroupName("");
    setNewGroupPermissions([]);
    setNewGroupVisibility("CREATED_BY_ME");
  }

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    const cardReadPerm = findCardReadPermission();
    const permissionsPayload = newGroupPermissions.map((id) => ({
      permissionId: id,
      cardReadVisibility: cardReadPerm && id === cardReadPerm.id ? newGroupVisibility : undefined,
    }));
    createMutation.mutate(
      {
        name: newGroupName,
        permissions: permissionsPayload,
      },
      {
        onSuccess: (data) => {
          setSelectedGroupId(data.group.id);
          setIsCreating(false);
          setNewGroupName("");
          setNewGroupPermissions([]);
          setNewGroupVisibility("CREATED_BY_ME");
        },
      },
    );
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;
    const cardReadPerm = findCardReadPermission();
    const permissionsPayload = editGroupPermissions.map((id) => ({
      permissionId: id,
      cardReadVisibility: cardReadPerm && id === cardReadPerm.id ? editGroupVisibility : undefined,
    }));
    updateMutation.mutate({
      groupId: selectedGroupId,
      payload: {
        name: editGroupName,
        permissions: permissionsPayload,
      },
    });
  }

  function handleDelete(groupId: string) {
    if (!confirm("Hapus group ini?")) return;
    deleteMutation.mutate(groupId, {
      onSuccess: () => {
        if (selectedGroupId === groupId) {
          setSelectedGroupId(null);
        }
      },
    });
  }

  function handleAssignSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedMembershipId || !assignGroupId) return;
    // Validate scopeId is required for non-Project scopes
    if (assignScopeType !== "project" && !assignScopeId.trim()) return;
    createAssignmentMutation.mutate(
      {
        membershipId: selectedMembershipId,
        groupId: assignGroupId,
        scopeType: assignScopeType,
        scopeId: assignScopeType === "project" ? projectId : assignScopeId,
      },
      {
        onSuccess: () => {
          setAssignGroupId("");
          setAssignScopeType("project");
          setAssignScopeId("");
        },
      },
    );
  }

  function handleRevokeAssignment(assignmentId: string) {
    if (!selectedMembershipId) return;
    if (!confirm("Cabut assignment ini?")) return;
    revokeAssignmentMutation.mutate({
      membershipId: selectedMembershipId,
      assignmentId,
    });
  }

  function handleDirectPermSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedMembershipId || !directPermPermissionId) return;
    if (directPermScopeType !== "project" && !directPermScopeId.trim()) return;
    const selectedPerm = permissions.find((p) => p.id === directPermPermissionId);
    createDirectPermissionMutation.mutate(
      {
        membershipId: selectedMembershipId,
        permissionId: directPermPermissionId,
        scopeType: directPermScopeType,
        scopeId: directPermScopeType === "project" ? projectId : directPermScopeId,
        cardReadVisibility: selectedPerm?.key === "card.read" ? directPermVisibility : undefined,
      },
      {
        onSuccess: () => {
          setDirectPermPermissionId("");
          setDirectPermScopeType("project");
          setDirectPermScopeId("");
          setDirectPermVisibility("CREATED_BY_ME");
        },
      },
    );
  }

  function handleRevokeDirectPermission(assignmentId: string) {
    if (!selectedMembershipId) return;
    if (!confirm("Cabut direct permission ini?")) return;
    revokeDirectPermissionMutation.mutate({
      membershipId: selectedMembershipId,
      assignmentId,
    });
  }

  function togglePermission(permissionId: string, isEdit: boolean) {
    if (isEdit) {
      setEditGroupPermissions((prev) =>
        prev.includes(permissionId)
          ? prev.filter((id) => id !== permissionId)
          : [...prev, permissionId],
      );
    } else {
      setNewGroupPermissions((prev) =>
        prev.includes(permissionId)
          ? prev.filter((id) => id !== permissionId)
          : [...prev, permissionId],
      );
    }
  }

  if (permissionsQuery.isLoading || groupsQuery.isLoading || membersQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Memuat...</div>;
  }

  return (
    <section aria-label="Permission Groups" className="flex flex-col gap-4 p-4">
      {/* Bagian 1: Group Management */}
      <div className="flex gap-4">
        {/* Sidebar: daftar group */}
        <div className="flex w-48 flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Groups</h3>
            <button
              type="button"
              onClick={handleStartCreate}
              className="rounded border border-input px-2 py-0.5 text-xs hover:bg-accent"
            >
              + Baru
            </button>
          </div>
          <ul className="flex flex-col gap-1" aria-label="Daftar Permission Group">
            {groups.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => handleSelectGroup(g)}
                  className={`w-full rounded px-2 py-1 text-left text-sm hover:bg-accent ${
                    selectedGroupId === g.id ? "bg-accent font-medium" : ""
                  }`}
                >
                  {g.name}
                </button>
              </li>
            ))}
          </ul>
          {groups.length === 0 && (
            <p className="text-xs text-muted-foreground">Belum ada group.</p>
          )}
        </div>

        {/* Main: form create/edit */}
        <div className="flex-1">
          {isCreating ? (
            <form onSubmit={handleCreateSubmit} className="flex flex-col gap-3">
              <h3 className="text-sm font-medium">Buat Group Baru</h3>
              <label className="text-xs text-muted-foreground">
                Nama Group
                <input
                  type="text"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
              </label>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs text-muted-foreground">Permissions</legend>
                {permissions.map((p) => (
                  <div key={p.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={newGroupPermissions.includes(p.id)}
                        onChange={() => togglePermission(p.id, false)}
                      />
                      <span className="font-mono text-xs">{p.key}</span>
                      <span className="text-xs text-muted-foreground">{p.description}</span>
                    </label>
                    {p.key === "card.read" && newGroupPermissions.includes(p.id) && (
                      <label className="ml-6 mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        Visibility:
                        <select
                          value={newGroupVisibility}
                          onChange={(e) => setNewGroupVisibility(e.target.value as CardReadVisibility)}
                          className="rounded border border-input bg-background px-1 py-0.5 text-xs"
                        >
                          {CARD_READ_VISIBILITIES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                ))}
              </fieldset>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={createMutation.isPending || !newGroupName.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                >
                  {createMutation.isPending ? "Membuat..." : "Buat"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
                >
                  Batal
                </button>
              </div>
              {createMutation.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {(createMutation.error as Error).message}
                </p>
              )}
            </form>
          ) : selectedGroup ? (
            <form onSubmit={handleEditSubmit} className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Edit: {selectedGroup.name}</h3>
                <button
                  type="button"
                  onClick={() => handleDelete(selectedGroup.id)}
                  disabled={deleteMutation.isPending}
                  className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                >
                  Hapus
                </button>
              </div>
              <label className="text-xs text-muted-foreground">
                Nama Group
                <input
                  type="text"
                  required
                  value={editGroupName}
                  onChange={(e) => setEditGroupName(e.target.value)}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
              </label>
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs text-muted-foreground">Permissions</legend>
                {permissions.map((p) => (
                  <div key={p.id}>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={editGroupPermissions.includes(p.id)}
                        onChange={() => togglePermission(p.id, true)}
                      />
                      <span className="font-mono text-xs">{p.key}</span>
                      <span className="text-xs text-muted-foreground">{p.description}</span>
                    </label>
                    {p.key === "card.read" && editGroupPermissions.includes(p.id) && (
                      <label className="ml-6 mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                        Visibility:
                        <select
                          value={editGroupVisibility}
                          onChange={(e) => setEditGroupVisibility(e.target.value as CardReadVisibility)}
                          className="rounded border border-input bg-background px-1 py-0.5 text-xs"
                        >
                          {CARD_READ_VISIBILITIES.map((v) => (
                            <option key={v} value={v}>
                              {v}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </div>
                ))}
              </fieldset>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="w-fit rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {updateMutation.isPending ? "Menyimpan..." : "Simpan"}
              </button>
              {updateMutation.isError && (
                <p role="alert" className="text-sm text-destructive">
                  {(updateMutation.error as Error).message}
                </p>
              )}
            </form>
          ) : (
            <p className="text-sm text-muted-foreground">
              Pilih group untuk diedit atau buat baru.
            </p>
          )}
        </div>
      </div>

      {/* Bagian 2: Membership Assignment */}
      <div className="border-t border-border pt-4">
        <h3 className="mb-3 text-sm font-medium">Group Assignments</h3>

        {/* Membership selector */}
        <label className="mb-3 block text-xs text-muted-foreground">
          Pilih Member
          <select
            value={selectedMembershipId ?? ""}
            onChange={(e) => setSelectedMembershipId(e.target.value || null)}
            className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            <option value="">— Pilih member —</option>
            {members.map((m) => (
              <option key={m.membershipId} value={m.membershipId}>
                {m.name} ({m.email})
              </option>
            ))}
          </select>
        </label>

        {selectedMembershipId && (
          <>
            {/* Assignment form */}
            <form onSubmit={handleAssignSubmit} className="mb-4 flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted-foreground">
                Group
                <select
                  value={assignGroupId}
                  onChange={(e) => setAssignGroupId(e.target.value)}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                  required
                >
                  <option value="" disabled>
                    Pilih group...
                  </option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs text-muted-foreground">
                Scope
                <select
                  value={assignScopeType}
                  onChange={(e) => setAssignScopeType(e.target.value as (typeof SCOPES)[number])}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {SCOPES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              {assignScopeType !== "project" && (
                <input
                  aria-label="Scope ID"
                  placeholder="ID entity scope"
                  value={assignScopeId}
                  onChange={(e) => setAssignScopeId(e.target.value)}
                  className="rounded-md border border-input bg-background px-2 py-1 text-sm"
                />
              )}
              <button
                type="submit"
                disabled={
                  createAssignmentMutation.isPending ||
                  !assignGroupId ||
                  (assignScopeType !== "project" && !assignScopeId.trim())
                }
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
              >
                {createAssignmentMutation.isPending ? "Assigning..." : "Assign"}
              </button>
            </form>
            {createAssignmentMutation.isError && (
              <p role="alert" className="mb-2 text-sm text-destructive">
                {(createAssignmentMutation.error as Error).message}
              </p>
            )}

            {/* Assignment list */}
            {assignmentsQuery.isLoading ? (
              <p className="text-xs text-muted-foreground">Memuat assignments...</p>
            ) : assignments.length > 0 ? (
              <ul className="flex flex-col gap-1" aria-label="Daftar Group Assignment">
                {assignments.map((a: GroupAssignment) => {
                  const group = groups.find((g) => g.id === a.groupId);
                  return (
                    <li key={a.id} className="flex items-center gap-3 text-sm">
                      <span className="font-medium">{group?.name ?? a.groupId}</span>
                      <span className="text-xs text-muted-foreground">
                        scope: {a.scopeType}
                        {a.scopeType !== "project" ? ` (${a.scopeId})` : ""}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRevokeAssignment(a.id)}
                        disabled={revokeAssignmentMutation.isPending}
                        className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Revoke
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-muted-foreground">Belum ada group assignment.</p>
            )}
          </>
        )}
      </div>

      {/* Bagian 3: Direct Permission Assignment */}
      {selectedMembershipId && (
        <div className="border-t border-border pt-4">
          <h3 className="mb-3 text-sm font-medium">Direct Permission Assignments</h3>

          {/* Direct Permission form */}
          <form onSubmit={handleDirectPermSubmit} className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-xs text-muted-foreground">
              Permission
              <select
                value={directPermPermissionId}
                onChange={(e) => setDirectPermPermissionId(e.target.value)}
                className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                required
              >
                <option value="" disabled>
                  Pilih permission...
                </option>
                {permissions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.key} — {p.description}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted-foreground">
              Scope
              <select
                value={directPermScopeType}
                onChange={(e) => setDirectPermScopeType(e.target.value as (typeof SCOPES)[number])}
                className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
              >
                {SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            {directPermScopeType !== "project" && (
              <input
                aria-label="Scope ID"
                placeholder="ID entity scope"
                value={directPermScopeId}
                onChange={(e) => setDirectPermScopeId(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-sm"
              />
            )}
            {directPermPermissionId && permissions.find((p) => p.id === directPermPermissionId)?.key === "card.read" && (
              <label className="text-xs text-muted-foreground">
                Visibility
                <select
                  value={directPermVisibility}
                  onChange={(e) => setDirectPermVisibility(e.target.value as CardReadVisibility)}
                  className="ml-2 rounded-md border border-input bg-background px-2 py-1 text-sm"
                >
                  {CARD_READ_VISIBILITIES.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button
              type="submit"
              disabled={
                createDirectPermissionMutation.isPending ||
                !directPermPermissionId ||
                (directPermScopeType !== "project" && !directPermScopeId.trim())
              }
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {createDirectPermissionMutation.isPending ? "Assigning..." : "Assign Permission"}
            </button>
          </form>
          {createDirectPermissionMutation.isError && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {(createDirectPermissionMutation.error as Error).message}
            </p>
          )}

          {/* Direct Permission list */}
          {directPermAssignmentsQuery.isLoading ? (
            <p className="text-xs text-muted-foreground">Memuat direct permissions...</p>
          ) : directPermAssignments.length > 0 ? (
            <ul className="flex flex-col gap-1" aria-label="Daftar Direct Permission Assignment">
              {directPermAssignments.map((a: PermissionAssignment) => {
                const perm = permissions.find((p) => p.id === a.permissionId);
                return (
                  <li key={a.id} className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-xs">{perm?.key ?? a.permissionId}</span>
                    {a.cardReadVisibility && (
                      <span className="text-xs text-muted-foreground">
                        visibility: {a.cardReadVisibility}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      scope: {a.scopeType}
                      {a.scopeType !== "project" ? ` (${a.scopeId})` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRevokeDirectPermission(a.id)}
                      disabled={revokeDirectPermissionMutation.isPending}
                      className="rounded border border-destructive px-2 py-0.5 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">Belum ada direct permission assignment.</p>
          )}
        </div>
      )}
    </section>
  );
}
