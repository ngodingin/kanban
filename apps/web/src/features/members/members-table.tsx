import { useMemberGroupAssignments, useMembers, usePermissionGroups, useInvitations, isPendingInvitation, type MemberSummary } from "@/features/members/hooks";

// Tabel Members (05-FRONTEND §5): User · Group · Status Active/Pending.
// Read-only pada goal ini — invite/revoke menyusul di goal lain.
export type MemberStatus = "Active" | "Revoked" | "Pending";

export interface MemberRow {
  key: string;
  email: string;
  name: string;
  groupNames: string[];
  status: MemberStatus;
}

function MemberGroups({
  projectId,
  membershipId,
  groups,
}: {
  projectId: string;
  membershipId: string;
  groups: ReadonlyArray<{ id: string; name: string }>;
}) {
  const assignments = useMemberGroupAssignments(projectId, membershipId);
  const names = (assignments.data ?? [])
    .map((a) => groups.find((g) => g.id === a.groupId)?.name ?? a.groupId)
    .join(", ");
  return <span>{names || "—"}</span>;
}

export function memberStatus(m: MemberSummary): Extract<MemberStatus, "Active" | "Revoked"> {
  return m.revokedAt ? "Revoked" : "Active";
}

export function MembersTable({ projectId }: { projectId?: string }) {
  const membersQuery = useMembers(projectId);
  const invitationsQuery = useInvitations(projectId);
  const groupsQuery = usePermissionGroups(projectId);

  if (!projectId) {
    return (
      <p className="p-4 text-sm text-muted-foreground">Pilih Project untuk melihat Members.</p>
    );
  }

  const members = membersQuery.data ?? [];
  const pending = (invitationsQuery.data ?? []).filter((i) => isPendingInvitation(i));
  const groups = groupsQuery.data ?? [];

  return (
    <table aria-label="Tabel Members" className="w-full text-left text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="py-1 pr-3 font-medium">User</th>
          <th className="py-1 pr-3 font-medium">Group</th>
          <th className="py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {members.map((m) => (
          <tr key={m.membershipId} data-membership-id={m.membershipId}>
            <td className="py-1 pr-3">
              <span className="font-medium">{m.name}</span>{" "}
              <span className="text-muted-foreground">{m.email}</span>
            </td>
            <td className="py-1 pr-3">
              <MemberGroups projectId={projectId} membershipId={m.membershipId} groups={groups} />
            </td>
            <td className="py-1">{memberStatus(m)}</td>
          </tr>
        ))}
        {pending.map((i) => (
          <tr key={i.id} data-invitation-id={i.id}>
            <td className="py-1 pr-3 text-muted-foreground">{i.email}</td>
            <td className="py-1 pr-3">—</td>
            <td className="py-1">Pending</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
