import { NavLink } from "react-router";
import { useUiStore } from "@/lib/ui-store";

// App shell — sidebar context-aware (05-FRONTEND §5). Tanpa Inbox:
// notification = non-goal (§4 rekonsiliasi UI↔domain).
const NAV_ITEMS = [
  { to: "/", label: "Home", end: true },
  { to: "/tasks", label: "My Tasks", end: false },
  { to: "/activity", label: "Activity", end: false },
] as const;

const PROJECT_ITEMS = [
  { to: "/members", label: "Members" },
  { to: "/permissions", label: "Permissions" },
  { to: "/api-keys", label: "API Keys" },
  { to: "/settings", label: "Settings" },
] as const;

export function Sidebar() {
  const collapsed = useUiStore((s) => s.sidebarCollapsed);

  return (
    <aside
      aria-label="Sidebar navigasi"
      data-collapsed={collapsed}
      className="flex w-56 shrink-0 flex-col border-r border-border bg-background"
    >
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}

        {/* PROJECTS ▾ — daftar Project nyata diisi goal projects feature; tanpa demo domain. */}
        <div className="mt-4 mb-1 px-3 text-xs font-semibold tracking-wide text-muted-foreground">
          PROJECTS ▾
        </div>

        {PROJECT_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `rounded-md px-3 py-2 text-sm ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-border p-3 text-xs text-muted-foreground">
        Powered by NGodingiN
      </div>
    </aside>
  );
}
