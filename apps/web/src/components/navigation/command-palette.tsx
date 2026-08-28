import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { readRecentProjectIds } from "@/features/home/recent";
import { useUiStore } from "@/lib/ui-store";

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
  const { projectId, milestoneId, boardId } = useParams<{ projectId?: string; milestoneId?: string; boardId?: string }>();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const storeCommands = useUiStore((s) => s.paletteCommands);

  const commands = useMemo<PaletteCommand[]>(() => {
    const recent = readRecentProjectIds()[0];
    const navCommands: PaletteCommand[] = [
      { id: "nav-home", label: "Ke Home", group: "Navigasi", run: () => navigate("/") },
      {
        id: "nav-tasks",
        label: "Ke My Tasks",
        group: "Navigasi",
        run: () => navigate("/tasks"),
      },
    ];

    // Add project navigation if we have projectId or recent
    const targetProject = projectId ?? recent;
    if (targetProject) {
      navCommands.push({
        id: "nav-project",
        label: "Ke Project",
        group: "Navigasi",
        run: () => navigate(`/projects/${targetProject}`),
      });

      // Add board navigation if we have boardId and milestoneId
      if (boardId && milestoneId) {
        navCommands.push({
          id: "nav-board",
          label: "Ke Board saat ini",
          group: "Navigasi",
          run: () => navigate(`/projects/${targetProject}/milestones/${milestoneId}/boards/${boardId}`),
        });
      }
    }

    return [...navCommands, ...storeCommands, ...extraCommands];
  }, [navigate, projectId, milestoneId, boardId, storeCommands, extraCommands]);

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
