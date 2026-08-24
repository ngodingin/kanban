import { useParams, useNavigate } from "react-router";
import { useProjects, useProject, useMilestone, useBoard } from "@/features/projects/hooks";

// Header app shell — breadcrumb Project › Milestone › Board + context switch
// (05-FRONTEND §5). Nama entity dari API nyata; tanpa demo data.
function Crumb({ label }: { label: string }) {
  return <span className="text-sm font-medium text-foreground">{label}</span>;
}

const Separator = () => <span className="text-muted-foreground">›</span>;

export function Header() {
  const params = useParams();
  const navigate = useNavigate();
  const projectId = params.projectId;

  const projectsQuery = useProjects();
  const projectQuery = useProject(projectId);
  const milestoneQuery = useMilestone(projectId, params.milestoneId);
  const boardQuery = useBoard(projectId, params.milestoneId, params.boardId);

  const projectList = Array.isArray(projectsQuery.data)
    ? projectsQuery.data
    : (projectsQuery.data?.projects ?? []);

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2">
        {projectId ? (
          <>
            <Crumb label={projectQuery.data?.name ?? "…"} />
            {params.milestoneId ? (
              <>
                <Separator />
                <Crumb label={milestoneQuery.data?.name ?? "…"} />
              </>
            ) : null}
            {params.boardId ? (
              <>
                <Separator />
                <Crumb label={boardQuery.data?.name ?? "…"} />
              </>
            ) : null}
          </>
        ) : (
          <Crumb label="NGodingin Kanban" />
        )}
      </nav>

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Context
        <select
          aria-label="Pilih Project"
          value={projectId ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            if (next) navigate(`/projects/${next}`);
          }}
          className="rounded-md border border-input bg-background px-2 py-1 text-sm"
        >
          <option value="" disabled>
            Pilih Project…
          </option>
          {projectList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
