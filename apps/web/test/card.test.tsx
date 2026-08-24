// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { DndContext } from "@dnd-kit/core";
import { afterEach, describe, expect, test } from "vitest";
import { KanbanCard, formatDueDate, previewDescription } from "../src/components/kanban/card";

function renderCard(card: Parameters<typeof KanbanCard>[0]["card"]) {
  return render(
    <DndContext>
      <ul>
        <KanbanCard card={card} listId="l1" />
      </ul>
    </DndContext>,
  );
}

afterEach(cleanup);

describe("TASK-7.6.1 — Card compact menampilkan field domain yang ada", () => {
  test("positif: title, preview description, labels, assignee, dan due date tampil", () => {
    const { container } = renderCard({
      id: "c1",
      title: "Buat migrasi",
      description: "Deskripsi panjang yang seharusnya terpotong pada delapan puluh karakter agar tetap ringkas di papan.",
      dueDate: "2026-09-01T00:00:00.000Z",
      assigneeUserId: "01HX8Q7M2N3P4R5S6TUVWXYZAB",
      labels: [{ id: "lb1", name: "backend" }],
    });

    expect(screen.getByText("Buat migrasi")).toBeTruthy();
    expect(screen.getByText(/terpotong pada delapan puluh/)).toBeTruthy();
    expect(screen.getByText("backend")).toBeTruthy();
    expect(screen.getByLabelText(/Assignee 01HX/)).toBeTruthy();
    const time = container.querySelector("time");
    expect(time?.getAttribute("datetime")).toBe("2026-09-01T00:00:00.000Z");
    expect(time?.textContent).not.toBe("");
  });

  test("positif: preview memotong >80 karakter dengan ellipsis", () => {
    const long = "a".repeat(120);
    const cut = previewDescription(long);
    expect(cut.length).toBe(81);
    expect(cut.endsWith("…")).toBe(true);
    expect(previewDescription(null)).toBe("");
  });

  test("positif: format tanggal kosong aman (tanpa due date / invalid)", () => {
    expect(formatDueDate(undefined)).toBe("");
    expect(formatDueDate(null)).toBe("");
    expect(formatDueDate("bukan-tanggal")).toBe("");
  });

  test("negatif: TIDAK ada priority / progress / status field (05-FRONTEND §4)", () => {
    const { container } = renderCard({
      id: "c2",
      title: "Kartu polos",
      listIdUnused: undefined,
    } as never);
    expect(container.textContent).not.toMatch(/\bpriority\b|\bprogress\b|\bstatus\b|high|medium|low/i);
    expect(screen.queryByRole("progressbar")).toBeNull();
    // Tidak ada elemen berlabel "Status" atau "Priority" apa pun bentuknya.
    expect(container.querySelector("[data-field='status']")).toBeNull();
    expect(container.querySelector("[data-field='priority']")).toBeNull();
  });

  test("negatif: kartu tanpa field opsional tidak merender elemen kosong label/assignee/time", () => {
    const { container } = renderCard({ id: "c3", title: "Minimal" });
    expect(container.querySelectorAll("ul ul")).toHaveLength(0); // tanpa daftar label
    expect(container.querySelector("time")).toBeNull();
    expect(container.textContent).not.toContain("●");
  });
});
