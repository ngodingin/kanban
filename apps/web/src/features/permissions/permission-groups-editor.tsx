import { type FormEvent, useState } from "react";
import {
  usePermissions,
  usePermissionGroupsList,
  useCreatePermissionGroup,
  useUpdatePermissionGroup,
  useDeletePermissionGroup,
  type PermissionGroup,
} from "./hooks";

interface PermissionGroupsEditorProps {
  projectId: string;
}

export function PermissionGroupsEditor({ projectId }: PermissionGroupsEditorProps) {
  const permissionsQuery = usePermissions(projectId);
  const groupsQuery = usePermissionGroupsList(projectId);
  const createMutation = useCreatePermissionGroup(projectId);
  const updateMutation = useUpdatePermissionGroup(projectId);
  const deleteMutation = useDeletePermissionGroup(projectId);

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPermissions, setNewGroupPermissions] = useState<string[]>([]);
  const [editGroupName, setEditGroupName] = useState("");
  const [editGroupPermissions, setEditGroupPermissions] = useState<string[]>([]);

  const permissions = permissionsQuery.data ?? [];
  const groups = groupsQuery.data ?? [];
  const selectedGroup = groups.find((g) => g.id === selectedGroupId);

  function handleSelectGroup(group: PermissionGroup) {
    setSelectedGroupId(group.id);
    setEditGroupName(group.name);
    setEditGroupPermissions(group.permissions.map((p) => p.permissionId));
    setIsCreating(false);
  }

  function handleStartCreate() {
    setIsCreating(true);
    setSelectedGroupId(null);
    setNewGroupName("");
    setNewGroupPermissions([]);
  }

  function handleCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    createMutation.mutate(
      {
        name: newGroupName,
        permissions: newGroupPermissions.map((id) => ({ permissionId: id })),
      },
      {
        onSuccess: (data) => {
          setSelectedGroupId(data.group.id);
          setIsCreating(false);
          setNewGroupName("");
          setNewGroupPermissions([]);
        },
      },
    );
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedGroupId) return;
    updateMutation.mutate({
      groupId: selectedGroupId,
      payload: {
        name: editGroupName,
        permissions: editGroupPermissions.map((id) => ({ permissionId: id })),
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

  if (permissionsQuery.isLoading || groupsQuery.isLoading) {
    return <div className="p-4 text-sm text-muted-foreground">Memuat...</div>;
  }

  return (
    <section aria-label="Permission Groups" className="flex gap-4 p-4">
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
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newGroupPermissions.includes(p.id)}
                    onChange={() => togglePermission(p.id, false)}
                  />
                  <span className="font-mono text-xs">{p.key}</span>
                  <span className="text-xs text-muted-foreground">{p.description}</span>
                </label>
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
                <label key={p.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editGroupPermissions.includes(p.id)}
                    onChange={() => togglePermission(p.id, true)}
                  />
                  <span className="font-mono text-xs">{p.key}</span>
                  <span className="text-xs text-muted-foreground">{p.description}</span>
                </label>
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
    </section>
  );
}
