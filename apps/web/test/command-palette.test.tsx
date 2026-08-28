// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, test, vi } from "vitest";
import { CommandPalette, filterCommands } from "../src/components/navigation/command-palette";

function renderPalette(open = true, extra = []) {
  const onClose = vi.fn();
  const utils = render(
    <MemoryRouter>
      <CommandPalette open={open} onClose={onClose} extraCommands={extra} />
    </MemoryRouter>,
  );
  return { ...utils, onClose };
}

afterEach(cleanup);

describe("TASK-7.12.1 — command palette ⌘K (navigasi + aksi existing)", () => {
  test("positif: terbuka merender daftar perintah navigasi; klik menjalankan + menutup", async () => {
    const user = userEvent.setup();
    const { onClose } = renderPalette(true);
    expect(screen.getByLabelText("Command palette")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Ke My Tasks/ })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Ke My Tasks/ }));
    expect(onClose).toHaveBeenCalled();
  });

  test("positif: filter query mempersempit perintah", () => {
    const cmds = [
      { id: "1", label: "Ke Home", group: "Navigasi" as const, run: () => {} },
      { id: "2", label: "Arsipkan Card", group: "Aksi" as const, run: () => {} },
    ];
    expect(filterCommands(cmds, "arsip")).toHaveLength(1);
    expect(filterCommands(cmds, "").length).toBe(2);
  });

  test("negatif: tertutup → tidak merender apa pun; Escape memanggil onClose", async () => {
    const user = userEvent.setup();
    const { container } = renderPalette(false);
    expect(container.innerHTML).toBe("");
    const openUtils = renderPalette(true);
    await user.keyboard("{Escape}");
    expect(openUtils.onClose).toHaveBeenCalled();
  });

  test("positif: aksi domain disuntik layar — palette hanya MENJALANKAN callback", async () => {
    const user = userEvent.setup();
    const archiveCard = vi.fn();
    renderPalette(true, [
      { id: "act-1", label: "Arsipkan Card", group: "Aksi", run: archiveCard },
    ]);
    await user.click(screen.getByRole("button", { name: /Arsipkan Card/ }));
    expect(archiveCard).toHaveBeenCalledTimes(1);
  });
});
