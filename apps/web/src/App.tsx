import { Route, Routes } from "react-router";

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
      <Route path="/" element={<Home />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
