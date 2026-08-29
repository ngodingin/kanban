import { Route, Routes, useParams } from "react-router";
import { useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { LoginPage } from "./features/auth/login-page";
import { PermissionGroupsEditor } from "./features/permissions/permission-groups-editor";
import { useRecentContext, RecentActivityPreview, recordProjectVisit, readRecentProjectIds } from "./features/home/recent";
import { CommandPalette } from "./components/navigation/command-palette";
import { useUiStore } from "./lib/ui-store";
import { BoardView } from "./components/kanban/board-view";

function RecordVisit() {
  const { projectId } = useParams<{ projectId: string }>();
  useEffect(() => {
    if (projectId) recordProjectVisit(projectId);
  }, [projectId]);
  return null;
}

function Home() {
  const { ordered, contextId } = useRecentContext();
  const recentIds = readRecentProjectIds();
  const recentProjects = ordered.filter((p) => recentIds.includes(p.id));
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">NGodingin Kanban</h1>

      <section aria-label="Recent Projects" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent Projects</h2>
        {recentProjects.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada project.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {recentProjects.map((p) => (
              <li key={p.id}>
                <a href={`/projects/${p.id}`} className="hover:underline">{p.name ?? p.id}</a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Recent Activity" className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">Recent Activity</h2>
        <RecentActivityPreview projectId={contextId} />
      </section>
    </main>
  );
}

function NotFound() {
  return <main className="p-6 text-muted-foreground">Halaman tidak ditemukan.</main>;
}

// Halaman domain nyata dibangun goal TASK-7.4+; shell menyediakan layout +
// header breadcrumb berbasis params rute.
function Shell({ children }: { children: React.ReactNode }) {
  const paletteOpen = useUiStore((s) => s.paletteOpen);
  const togglePalette = useUiStore((s) => s.togglePalette);
  const closePalette = useUiStore((s) => s.closePalette);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        togglePalette();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePalette]);

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
      <CommandPalette
        open={paletteOpen}
        onClose={closePalette}
      />
    </div>
  );
}

function BoardPage() {
  const { projectId, milestoneId, boardId } = useParams<{
    projectId: string;
    milestoneId: string;
    boardId: string;
  }>();
  return <BoardView projectId={projectId!} milestoneId={milestoneId!} boardId={boardId!} />;
}

export default function App() {
  return (
    <Routes>
      {/* Layar autentikasi standalone — tanpa app shell (05-FRONTEND §5). */}
      <Route path="/login" element={<LoginPage />} />

      <Route path="/" element={<Shell><Home /></Shell>} />

      {/* Konteks Project/Milestone/Board — breadcrumb header mengikuti params. */}
      <Route
        path="/projects/:projectId"
        element={
          <Shell>
            <RecordVisit />
            <ProjectPlaceholder />
          </Shell>
        }
      />
      <Route
        path="/projects/:projectId/milestones/:milestoneId"
        element={
          <Shell>
            <RecordVisit />
            <MilestonePlaceholder />
          </Shell>
        }
      />
      <Route
        path="/projects/:projectId/milestones/:milestoneId/boards/:boardId"
        element={
          <Shell>
            <RecordVisit />
            <BoardPage />
          </Shell>
        }
      />
      <Route
        path="/projects/:projectId/permissions"
        element={
          <Shell>
            <RecordVisit />
            <PermissionsPage />
          </Shell>
        }
      />

      {/* Route non-domain tetap memakai shell tanpa breadcrumb context. */}
      <Route
        path="*"
        element={
          <Shell>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Shell>
        }
      />
    </Routes>
  );
}

function ProjectPlaceholder() {
  const { projectId } = useParams();
  return <div className="p-6 text-sm text-muted-foreground">Project {projectId}</div>;
}
function MilestonePlaceholder() {
  const { milestoneId } = useParams();
  return <div className="p-6 text-sm text-muted-foreground">Milestone {milestoneId}</div>;
}
function PermissionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <PermissionGroupsEditor projectId={projectId!} />;
}
