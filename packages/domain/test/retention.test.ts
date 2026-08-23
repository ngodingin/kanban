import { describe, expect, it } from "vitest";
import { isPruneEligible, RETENTION_DAYS } from "@kanban/domain";

const NOW = new Date("2026-08-23T00:00:00.000Z");

const daysAgo = (days: number, offsetMs = 0): string =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000 - offsetMs).toISOString();

describe("isPruneEligible — BR-016A retention 30 hari (goal 5.1.1)", () => {
  it("[BR-016A][negatif] deletedAt null (ACTIVE/ARCHIVED) → SELALU false berapa pun now", () => {
    expect(isPruneEligible(null, NOW)).toBe(false);
    expect(isPruneEligible(null, new Date("2999-01-01T00:00:00.000Z"))).toBe(false);
  });

  it("[BR-016A][boundary] tepat 30 hari − 1 detik → false (belum genap)", () => {
    // deletedAt lebih BARU 1 detik dari batas 30 hari
    expect(isPruneEligible(daysAgo(RETENTION_DAYS, -1000), NOW)).toBe(false);
  });

  it("[BR-016A][boundary inclusive] tepat 30 hari → true", () => {
    expect(isPruneEligible(daysAgo(RETENTION_DAYS), NOW)).toBe(true);
  });

  it("[Prinsip #7] 31 hari & 100 hari lalu → true (job terlambat tetap eligible)", () => {
    expect(isPruneEligible(daysAgo(31), NOW)).toBe(true);
    expect(isPruneEligible(daysAgo(100), NOW)).toBe(true);
  });

  it("[negatif] baru di-delete (1 hari) → false; deletedAt invalid → false (defensif)", () => {
    expect(isPruneEligible(daysAgo(1), NOW)).toBe(false);
    expect(isPruneEligible("bukan-iso-date", NOW)).toBe(false);
  });
});

describe("isPruneEligible — kemurnian fungsi (DoD, goal 5.1.1)", () => {
  it("[DoD] deterministik: now sama → hasil sama; RETENTION_DAYS = 30 konstanta publik", () => {
    const d = daysAgo(30);
    expect(isPruneEligible(d, NOW)).toBe(isPruneEligible(d, NOW));
    expect(RETENTION_DAYS).toBe(30);
  });
});
