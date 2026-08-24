import { Route, Routes } from "react-router";
import { Sidebar } from "./components/layout/sidebar";
import { LoginPage } from "./features/auth/login-page";

function Home() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <h1 className="p-6 text-2xl font-semibold tracking-tight">NGodingin Kanban</h1>
    </main>
  );
}

function NotFound() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <p className="p-6 text-muted-foreground">Halaman tidak ditemukan.</p>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Layar autentikasi standalone — tanpa app shell (05-FRONTEND §5). */}
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="*"
        element={
          <div className="flex min-h-svh">
            <Sidebar />
            <div className="flex-1">
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </div>
        }
      />
    </Routes>
  );
}
