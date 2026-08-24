import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { readRecentProjectIds } from "@/features/home/recent";

// Command palette (05-FRONTEND §3.1) — OPSIONAL, hanya navigasi/aksi yang
// sudah ada; bukan search engine. ⌘K/Ctrl+K membuka. Aksi memanggil domain
// command via callback pemanggil — TIDAK mem-bypass rule apa pun.
export interface PaletteCommand {
  id: string;
  label: string;
  group: "Navigasi" | "Aksi";
  run: () => void;
}

export function filterCommands(
  commands: ReadonlyArray<PaletteCommand>,
  query: string,
): PaletteCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...commands];
  return commands.filter((c) => c.label.toLowerCase().includes(q));
}

export function CommandPalette({
  open,
  onClose,
  extraCommands = [],
}: {
  open: boolean;
  onClose: () => void;
  /** Aksi domain milik layar aktif (mis. archiveCard). Palette hanya menjalankan. */
  extraCommands?: PaletteCommand[];
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onClose(); // toggle sederhana: parent mengelola open state via prop
      }
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const commands = useMemo<PaletteCommand[]>(() => {
    const recent = readRecentProjectIds()[0];
    return [
      { id: "nav-home", label: "Ke Home", group: "Navigasi", run: () => navigate("/") },
      {
        id: "nav-tasks",
        label: "Ke My Tasks",
        group: "Navigasi",
        run: () => navigate("/tasks"),
      },
      ...(recent
        ? [
            {
              id: "nav-project",
              label: "Buka Project terakhir",
              group: "Navigasi" as const,
              run: () => navigate(`/projects/${recent}`),
            },
          ]
        : []),
      ...extraCommands,
    ];
  }, [navigate, extraCommands]);

  if (!open) return null;
  const visible = filterCommands(commands, query);

  return (
    <div role="dialog" aria-modal="true" aria-label="Command palette" className="fixed inset-0 z-50 flex items-start justify-center bg-foreground/20 p-4 pt-24">
      <div className="w-full max-w-md rounded-md border border-border bg-card p-2">
        <input
          autoFocus
          aria-label="Cari perintah"
          placeholder="Ketik perintah…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="mb-1 w-full rounded-sm border border-input bg-background px-3 py-2 text-sm"
        />
        <ul aria-label="Daftar perintah">
          {visible.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  c.run();
                  onClose();
                }}
                className="flex w-full items-center justify-between rounded-sm px-3 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span>{c.label}</span>
                <span className="text-xs text-muted-foreground">{c.group}</span>
              </button>
            </li>
          ))}
          {visible.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Tidak ada perintah.</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
