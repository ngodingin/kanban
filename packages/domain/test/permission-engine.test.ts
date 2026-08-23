import { describe, expect, it } from "vitest";
import {
  hasPermission,
  resolveCardVisibilityFilter,
  resolveEffectivePermissions,
  type PermissionHierarchyInput,
  type ResolveEffectivePermissionsInput,
  type ScopedDirectPermissionInput,
  type ScopedGroupAssignmentInput,
} from "@kanban/domain";

const PROJECT = "proj_1";
const MS_A = "ms_aaa";
const MS_B = "ms_bbb";
const BD_A = "bd_aaa";
const LS_A = "ls_aaa";
const CD_A = "cd_aaa";

const ALL_KEYS = [
  "project.read",
  "milestone.create",
  "board.update",
  "list.delete",
  "card.read",
  "card.move",
  "member.invite",
  "api_key.revoke",
] as const;

const H_FULL: PermissionHierarchyInput = {
  projectId: PROJECT,
  milestoneId: MS_A,
  boardId: BD_A,
  listId: LS_A,
  cardId: CD_A,
};

const group = (permissionKeys: readonly string[], scopeType: ScopedGroupAssignmentInput["scopeType"], scopeId: string): ScopedGroupAssignmentInput => ({
  groupId: `grp_${scopeType}_${scopeId}`,
  permissionKeys,
  scopeType,
  scopeId,
});

const direct = (
  permissionKey: string,
  scopeType: ScopedDirectPermissionInput["scopeType"],
  scopeId: string,
  cardReadVisibility?: ScopedDirectPermissionInput["cardReadVisibility"],
): ScopedDirectPermissionInput => ({ permissionKey, scopeType, scopeId, ...(cardReadVisibility ? { cardReadVisibility } : {}) });

const resolve = (over: Partial<ResolveEffectivePermissionsInput>) =>
  resolveEffectivePermissions({
    allPermissionKeys: ALL_KEYS,
    groupAssignments: [],
    directAssignments: [],
    hierarchy: H_FULL,
    isOwner: false,
    ...over,
  });

describe("resolveEffectivePermissions — Owner bypass grant (BR-037, goal 4.1.1)", () => {
  it("[BR-037][properti] Owner granted SELURUH katalog + visibility ALL, termasuk dengan assignment kosong", () => {
    for (const groups of [[], [group(["card.read"], "project", PROJECT)], [group(["milestone.create"], "milestone", MS_B)]]) {
      const effective = resolve({ isOwner: true, groupAssignments: groups });
      expect(effective.grantedKeys.size).toBe(ALL_KEYS.length);
      for (const key of ALL_KEYS) expect(effective.grantedKeys.has(key)).toBe(true);
      expect(effective.cardReadVisibility).toBe("ALL");
    }
  });
});

describe("resolveEffectivePermissions — union additive tanpa DENY (BR-038, goal 4.1.1)", () => {
  it("[BR-038] Non-Owner tanpa assignment → grantedKeys kosong + default CREATED_BY_ME", () => {
    const effective = resolve({});
    expect(effective.grantedKeys.size).toBe(0);
    expect(effective.cardReadVisibility).toBe("CREATED_BY_ME");
  });

  it("[BR-038][properti] Union 2 Group pada scope sama → gabungan key keduanya (bukan salah satu menang)", () => {
    for (const [scopeType, scopeId] of [
      ["project", PROJECT],
      ["milestone", MS_A],
      ["board", BD_A],
      ["list", LS_A],
      ["card", CD_A],
    ] as const) {
      const effective = resolve({
        groupAssignments: [group(["card.move"], scopeType, scopeId), group(["milestone.create"], scopeType, scopeId)],
        hierarchy: H_FULL,
      });
      expect(effective.grantedKeys.has("card.move"), scopeType).toBe(true);
      expect(effective.grantedKeys.has("milestone.create"), scopeType).toBe(true);
      expect(effective.grantedKeys.size).toBe(2);
    }
  });

  it("[BR-043] per-operasi: hanya key yang di-grant yang muncul, tidak ada efek silang antar key", () => {
    const effective = resolve({ groupAssignments: [group(["card.read"], "project", PROJECT)] });
    expect(effective.grantedKeys.has("card.read")).toBe(true);
    expect(effective.grantedKeys.has("card.update")).toBe(false);
    expect(effective.grantedKeys.has("card.move")).toBe(false);
  });
});

describe("resolveEffectivePermissions — scope matching hierarchy saat ini (BR-042, goal 4.1.1)", () => {
  it("[BR-042][properti] Grant scope Project berlaku untuk entity APAPUN di Project itu", () => {
    const hierarchies: PermissionHierarchyInput[] = [
      { projectId: PROJECT },
      { projectId: PROJECT, milestoneId: MS_B },
      { projectId: PROJECT, milestoneId: MS_A, boardId: BD_A },
      { projectId: PROJECT, milestoneId: MS_A, boardId: BD_A, listId: LS_A },
      { projectId: PROJECT, milestoneId: MS_A, boardId: BD_A, listId: LS_A, cardId: CD_A },
    ];
    for (const hierarchy of hierarchies) {
      const effective = resolve({ groupAssignments: [group(["board.update"], "project", PROJECT)], hierarchy });
      expect(effective.grantedKeys.has("board.update")).toBe(true);
    }
  });

  it("[BR-042][negatif eksplisit] Grant scope Milestone A TIDAK berlaku untuk entity di Milestone B (Project sama)", () => {
    const underB: PermissionHierarchyInput = { projectId: PROJECT, milestoneId: MS_B };
    for (const hierarchy of [underB, { projectId: PROJECT }, H_FULL]) {
      const effective = resolve({ groupAssignments: [group(["card.move"], "milestone", MS_A)], hierarchy });
      if (hierarchy.milestoneId !== MS_A) {
        expect(effective.grantedKeys.size, JSON.stringify(hierarchy)).toBe(0);
      } else {
        expect(effective.grantedKeys.size).toBe(1);
      }
    }
  });

  it("[BR-042][properti] Scope Board/List/Card match persis level-nya; salah satu level beda → tidak applicable", () => {
    const cases = [
      { scopeType: "board", scopeId: BD_A, hit: H_FULL, miss: { ...H_FULL, boardId: "bd_other" } },
      { scopeType: "list", scopeId: LS_A, hit: H_FULL, miss: { ...H_FULL, listId: null } },
      { scopeType: "card", scopeId: CD_A, hit: H_FULL, miss: { ...H_FULL, cardId: "cd_other" } },
    ] as const;
    for (const c of cases) {
      const hit = resolve({ groupAssignments: [group(["card.move"], c.scopeType, c.scopeId)], hierarchy: c.hit });
      expect(hit.grantedKeys.size, c.scopeType).toBe(1);
      const miss = resolve({ groupAssignments: [group(["card.move"], c.scopeType, c.scopeId)], hierarchy: c.miss });
      expect(miss.grantedKeys.size, c.scopeType).toBe(0);
    }
  });

  it("[BR-042A] Direct Permission menambah union tanpa mengubah Group grant; scope salah → tidak menambah apa pun", () => {
    const mixed = resolve({
      groupAssignments: [group(["card.read"], "project", PROJECT)],
      directAssignments: [direct("milestone.create", "milestone", MS_A)],
    });
    expect(mixed.grantedKeys.size).toBe(2);

    const wrongScope = resolve({
      groupAssignments: [group(["card.read"], "project", PROJECT)],
      directAssignments: [direct("milestone.create", "milestone", MS_B)],
    });
    expect(wrongScope.grantedKeys.has("card.read")).toBe(true);
    expect(wrongScope.grantedKeys.has("milestone.create")).toBe(false);
  });
});

describe("resolveEffectivePermissions — cardReadVisibility (BR-047/048/049, D.3, goal 4.1.1)", () => {
  it("[BR-048] 2 grant card.read applicable visibility beda → TERLUAS menang (ALL > ASSIGNED_TO_ME > CREATED_BY_ME)", () => {
    const pairs = [
      ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ASSIGNED_TO_ME"],
      ["ASSIGNED_TO_ME", "ALL", "ALL"],
      ["CREATED_BY_ME", "ALL", "ALL"],
      ["ALL", "CREATED_BY_ME", "ALL"],
    ] as const;
    for (const [v1, v2, widest] of pairs) {
      const effective = resolve({
        groupAssignments: [group(["milestone.create"], "project", PROJECT)],
        directAssignments: [direct("card.read", "project", PROJECT, v1), direct("card.read", "milestone", MS_A, v2)],
      });
      expect(effective.cardReadVisibility, `${v1} vs ${v2}`).toBe(widest);
      expect(effective.grantedKeys.has("card.read")).toBe(true);
      expect(effective.grantedKeys.has("milestone.create")).toBe(true);
    }
  });

  it("[BR-049] card.read visibility dari scope TIDAK applicable → tidak memengaruhi visibility (default tetap)", () => {
    const effective = resolve({
      directAssignments: [direct("card.read", "milestone", MS_B, "ALL")],
    });
    expect(effective.grantedKeys.size).toBe(0);
    expect(effective.cardReadVisibility).toBe("CREATED_BY_ME");
  });

  it("[D.3] card.read via Group tanpa direct grant → key granted tapi visibility tetap CREATED_BY_ME (Group tidak membawa visibility)", () => {
    const effective = resolve({ groupAssignments: [group(["card.read"], "project", PROJECT)] });
    expect(effective.grantedKeys.has("card.read")).toBe(true);
    expect(effective.cardReadVisibility).toBe("CREATED_BY_ME");
  });
});

describe("resolveEffectivePermissions — kemurnian fungsi (DoD, goal 4.1.1)", () => {
  it("[DoD] Deterministik: input sama → hasil ekuivalen; input tidak dimutasi", () => {
    const input: ResolveEffectivePermissionsInput = {
      allPermissionKeys: ALL_KEYS,
      groupAssignments: [group(["card.read", "card.move"], "milestone", MS_A)],
      directAssignments: [direct("card.read", "board", BD_A, "ASSIGNED_TO_ME")],
      hierarchy: H_FULL,
      isOwner: false,
    };
    const a = resolveEffectivePermissions(input);
    const b = resolveEffectivePermissions(input);
    expect([...a.grantedKeys].sort()).toEqual([...b.grantedKeys].sort());
    expect(a.cardReadVisibility).toBe(b.cardReadVisibility);
    expect(input.groupAssignments[0]!.permissionKeys).toHaveLength(2);
  });
});

describe("hasPermission — helper call site (goal 4.1.2)", () => {
  it("[BR-043] true hanya untuk key yang di-grant; false untuk key lain dan set kosong", () => {
    const effective = resolve({ groupAssignments: [group(["card.read"], "project", PROJECT)] });
    expect(hasPermission(effective, "card.read")).toBe(true);
    expect(hasPermission(effective, "card.update")).toBe(false);

    const empty = resolve({});
    for (const key of ALL_KEYS) expect(hasPermission(empty, key)).toBe(false);
  });

  it("[BR-037] Owner → true untuk seluruh katalog", () => {
    const owner = resolve({ isOwner: true });
    for (const key of ALL_KEYS) expect(hasPermission(owner, key)).toBe(true);
  });
});

describe("resolveCardVisibilityFilter — D.3/BR-047 (goal 4.1.2)", () => {
  const ME = "user_me";
  const OTHER = "user_other";
  const cards = [
    { creatorUserId: ME, assigneeUserId: null },
    { creatorUserId: OTHER, assigneeUserId: ME },
    { creatorUserId: OTHER, assigneeUserId: OTHER },
    { creatorUserId: null, assigneeUserId: ME },
  ];

  it("[BR-047] CREATED_BY_ME → hanya Card buatan sendiri (assignee tidak cukup)", () => {
    const filter = resolveCardVisibilityFilter(resolve({}), ME);
    expect(cards.filter(filter)).toEqual([cards[0]]);
  });

  it("[BR-047] ASSIGNED_TO_ME → union OR creator/assignee", () => {
    const filter = resolveCardVisibilityFilter(
      resolve({ directAssignments: [direct("card.read", "project", PROJECT, "ASSIGNED_TO_ME")] }),
      ME,
    );
    expect(cards.filter(filter)).toEqual([cards[0], cards[1], cards[3]]);
  });

  it("[BR-048] ALL → semua Card tanpa kecuali", () => {
    const filter = resolveCardVisibilityFilter(
      resolve({ directAssignments: [direct("card.read", "project", PROJECT, "ALL")] }),
      ME,
    );
    expect(cards.filter(filter)).toHaveLength(cards.length);
  });
});
