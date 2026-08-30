import { Route, Routes, useParams } from "react-router";
import { useEffect } from "react";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { SessionGate } from "@/components/auth/session-gate";
import { LoginPage } from "./features/auth/login-page";
import { LoginPageVerify } from "./features/auth/login-page-verify";
import { PermissionGroupsEditor } from "./features/permissions/permission-groups-editor";
import { MembersTable } from "./features/members/members-table";
import { ApiKeysPanel } from "./features/credentials/credential-panels";
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
      {/* 7.15.0 CL-105 — magic link verify callback tanpa redirect 302.
          Route ini dipanggil oleh email link setelah guardedSendMagicLink
          me-rewrite callbackURL ke /login/verify. Session cookie di-set oleh
          response 200 (bukan 302 redirect yang di-strip Vercel). */}
      <Route path="/login/verify" element={<LoginPageVerify />} />

      <Route
        path="/*"
        element={
          <SessionGate>
            <Routes>
              <Route path="/" element={<Shell><Home /></Shell>} />
              <Route path="/tasks" element={<Shell><MyTasksPage /></Shell>} />
              <Route path="/activity" element={<Shell><ActivityPage /></Shell>} />
              <Route path="/projects/:projectId" element={<Shell><RecordVisit /><ProjectPlaceholder /></Shell>} />
              <Route path="/projects/:projectId/milestones/:milestoneId" element={<Shell><RecordVisit /><MilestonePlaceholder /></Shell>} />
              <Route path="/projects/:projectId/milestones/:milestoneId/boards/:boardId" element={<Shell><RecordVisit /><BoardPage /></Shell>} />
              <Route path="/projects/:projectId/members" element={<Shell><RecordVisit /><MembersPage /></Shell>} />
              <Route path="/projects/:projectId/permissions" element={<Shell><RecordVisit /><PermissionsPage /></Shell>} />
              <Route path="/projects/:projectId/api-keys" element={<Shell><RecordVisit /><ApiKeysPage /></Shell>} />
              <Route path="/projects/:projectId/settings" element={<Shell><RecordVisit /><SettingsPage /></Shell>} />
              <Route path="*" element={<Shell><NotFound /></Shell>} />
            </Routes>
          </SessionGate>
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

function MyTasksPage() {
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">My Tasks</h1>
      <p className="text-sm text-muted-foreground">Tugas yang ditugaskan kepada Anda dari seluruh Project.</p>
    </main>
  );
}

function ActivityPage() {
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Activity</h1>
      <p className="text-sm text-muted-foreground">Timeline aktivitas dari seluruh Project.</p>
    </main>
  );
}

function MembersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Members</h1>
      <MembersTable projectId={projectId} />
    </main>
  );
}

function ApiKeysPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">API Keys</h1>
      <ApiKeysPanel projectId={projectId!} />
    </main>
  );
}

function SettingsPage() {
  return (
    <main className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Settings</h1>
      <p className="text-sm text-muted-foreground">Pengaturan Project.</p>
    </main>
  );
}
