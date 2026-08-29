import { expect, test, type Page } from "@playwright/test";

const PROJECT_ID = "e2e-proj-001";
const BOARD_ID = "e2e-board-001";
const MILESTONE_ID = "ms-001";
const LIST_A_ID = "e2e-list-a";
const LIST_B_ID = "e2e-list-b";
const CARD_1_ID = "e2e-card-001";
const CARD_2_ID = "e2e-card-002";

const lists = [
  { id: LIST_A_ID, boardId: BOARD_ID, title: "To Do", archivedAt: null, deletedAt: null },
  { id: LIST_B_ID, boardId: BOARD_ID, title: "In Progress", archivedAt: null, deletedAt: null },
];

const cardsA = [
  { id: CARD_1_ID, title: "Setup repo" },
  { id: CARD_2_ID, title: "Write tests" },
];

const cardDetail = {
  id: CARD_1_ID,
  listId: LIST_A_ID,
  title: "Setup repo",
  description: "Initialize monorepo structure",
  version: 1,
  archivedAt: null,
  deletedAt: null,
  labels: [],
};

const board = { id: BOARD_ID, title: "Sprint 1" };
const milestone = { id: MILESTONE_ID, title: "Phase 7" };
const project = { id: PROJECT_ID, name: "E2E Project" };

const BOARD_URL = `/api/v1/projects/${PROJECT_ID}/boards/${BOARD_ID}`;

async function stubBoardApis(page: Page, opts?: { moveStatus?: number; moveBody?: string }) {
  const moveStatus = opts?.moveStatus ?? 200;
  const moveBody = opts?.moveBody ?? JSON.stringify({ ok: true });

  // Session gate: return valid session so SessionGate passes through
  await page.route("**/api/auth/get-session", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "e2e-session", userId: "e2e-user-001", expiresAt: Date.now() + 3600_000 },
        user: { id: "e2e-user-001", name: "E2E User" },
      }),
    });
  });

  await page.route(`${BOARD_URL}/lists`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { lists } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/lists/${LIST_A_ID}/cards`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { cards: cardsA } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/lists/${LIST_B_ID}/cards`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { cards: [] } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/cards/${CARD_1_ID}/move`, async (route) => {
    await route.fulfill({ status: moveStatus, contentType: "application/json", body: moveBody });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/cards/${CARD_1_ID}/activities`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { activities: [] } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { board } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { milestone } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { project } }) });
  });
  await page.route(`**/api/v1/projects/${PROJECT_ID}/lists/${LIST_A_ID}`, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { list: lists[0] } }) });
  });
  // Card detail — stub after board/apis to allow overriding per-test
  await page.route(`**/api/v1/projects/${PROJECT_ID}/cards/${CARD_1_ID}`, async (route) => {
    if (route.request().method() === "PATCH") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { card: cardDetail } }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { card: cardDetail } }) });
  });
}

test.describe("Board domain flow (05-FRONTEND §5, 02-SPEC C.8)", () => {
  test("positif: board view renders List columns from API response", async ({ page }) => {
    await stubBoardApis(page);
    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    await expect(page.getByRole("heading", { name: "To Do" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "In Progress" })).toBeVisible();
  });

  test("positif: board view renders Cards within each List from API response", async ({ page }) => {
    await stubBoardApis(page);
    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    await expect(page.getByText("Setup repo")).toBeVisible();
    await expect(page.getByText("Write tests")).toBeVisible();
  });

  test("positif: card count displays correctly per List", async ({ page }) => {
    await stubBoardApis(page);
    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    await expect(page.getByLabel("Jumlah kartu To Do")).toHaveText("2");
    await expect(page.getByLabel("Jumlah kartu In Progress")).toHaveText("0");
  });

  test("positif: click Card opens detail panel with description", async ({ page }) => {
    await stubBoardApis(page);
    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    // Click card — locator.evaluate triggers React's synthetic event system
    await page.locator(`[data-card-id="${CARD_1_ID}"]`).evaluate((el) => (el as HTMLElement).click());

    // Detail panel should render with card title and description textarea
    await expect(page.getByRole("heading", { name: "Setup repo" })).toBeVisible({ timeout: 10_000 });
    const textarea = page.getByLabel("Description");
    await expect(textarea).toBeVisible({ timeout: 10_000 });
    await expect(textarea).toHaveValue("Initialize monorepo structure");
  });

  test("positif: Move Card via palette calls /cards/:id/move with correct payload", async ({ page }) => {
    let moveRequestReceived = false;
    let moveBody: string | undefined;

    await stubBoardApis(page);

    // Override move route AFTER stubBoardApis
    await page.route(`**/api/v1/projects/${PROJECT_ID}/cards/${CARD_1_ID}/move`, async (route) => {
      moveRequestReceived = true;
      moveBody = route.request().postData() ?? undefined;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    });

    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    // Open card detail panel via locator.evaluate (triggers React synthetic event)
    await page.locator(`[data-card-id="${CARD_1_ID}"]`).evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByRole("heading", { name: "Setup repo" })).toBeVisible({ timeout: 10_000 });

    // Open command palette and trigger Move Card
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Cari perintah").fill("Pindahkan");
    await page.getByText("Pindahkan Card").click();

    // Click destination list button in the move picker (not the board heading)
    await expect(page.getByText("Pindahkan ke List:")).toBeVisible();
    await page.locator('button:has-text("In Progress"):not(:has-text("saat ini"))').click();

    await page.waitForTimeout(1000);

    expect(moveRequestReceived).toBe(true);
    if (moveBody) {
      const parsed = JSON.parse(moveBody);
      expect(parsed.destinationListId).toBe(LIST_B_ID);
      expect(typeof parsed.expectedVersion).toBe("number");
    }
  });

  test("negatif: VERSION_CONFLICT move is handled — picker stays open, no crash", async ({ page }) => {
    await stubBoardApis(page);

    // Override move route AFTER stubBoardApis to return 409
    await page.route(`**/api/v1/projects/${PROJECT_ID}/cards/${CARD_1_ID}/move`, async (route) => {
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "VERSION_CONFLICT", message: "Card sudah diubah" } }),
      });
    });

    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    // Open card detail panel
    await page.locator(`[data-card-id="${CARD_1_ID}"]`).evaluate((el) => (el as HTMLElement).click());
    await expect(page.getByRole("heading", { name: "Setup repo" })).toBeVisible({ timeout: 10_000 });

    // Open command palette and trigger Move Card
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByLabel("Cari perintah").fill("Pindahkan");
    await page.getByText("Pindahkan Card").click();

    // Click destination list button in the move picker
    await expect(page.getByText("Pindahkan ke List:")).toBeVisible();
    await page.locator('button:has-text("In Progress"):not(:has-text("saat ini"))').click();

    // Move fails with 409 — picker stays open (no onSuccess to close it),
    // board and detail panel remain rendered without crash
    await page.waitForTimeout(1000);
    await expect(page.getByText("Pindahkan ke List:")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Setup repo" })).toBeVisible();
  });

  test("negatif: failed lists API shows error in console", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    // Stub board first, then override lists to return 500
    await stubBoardApis(page);
    await page.route(`${BOARD_URL}/lists`, async (route) => {
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: "INTERNAL" } }) });
    });

    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    await page.waitForTimeout(2000);
    expect(errors.length).toBeGreaterThan(0);
  });

  test("positif: empty board shows no list columns", async ({ page }) => {
    // Stub first, then override lists to return empty
    await stubBoardApis(page);
    await page.route(`${BOARD_URL}/lists`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { lists: [] } }) });
    });

    await page.goto(`/projects/${PROJECT_ID}/milestones/${MILESTONE_ID}/boards/${BOARD_ID}`);

    await expect(page.getByRole("heading", { name: "To Do" })).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "In Progress" })).not.toBeVisible();
  });
});
