import { Route, Routes, useParams } from "react-router";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { LoginPage } from "./features/auth/login-page";

function Home() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-semibold tracking-tight">NGodingin Kanban</h1>
    </main>
  );
}

function NotFound() {
  return <main className="p-6 text-muted-foreground">Halaman tidak ditemukan.</main>;
}

// Halaman domain nyata dibangun goal TASK-7.4+; shell menyediakan layout +
// header breadcrumb berbasis params rute.
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
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
            <ProjectPlaceholder />
          </Shell>
        }
      />
      <Route
        path="/projects/:projectId/milestones/:milestoneId"
        element={
          <Shell>
            <MilestonePlaceholder />
          </Shell>
        }
      />
      <Route
        path="/projects/:projectId/milestones/:milestoneId/boards/:boardId"
        element={
          <Shell>
            <BoardPlaceholder />
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
function BoardPlaceholder() {
  const { boardId } = useParams();
  return <div className="p-6 text-sm text-muted-foreground">Board {boardId}</div>;
}
