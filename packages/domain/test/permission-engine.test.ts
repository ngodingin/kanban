import { describe, expect, it } from "vitest";
import {
  hasPermission,
  resolveCardVisibilityFilter,
  resolveEffectivePermissions,
  type CardReadVisibility,
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

type GroupEntry = ScopedGroupAssignmentInput["permissions"][number];

const group = (
  permissions: readonly GroupEntry[],
  scopeType: ScopedGroupAssignmentInput["scopeType"],
  scopeId: string,
): ScopedGroupAssignmentInput => ({ scopeType, scopeId, permissions });

const keys = (...keys: string[]): GroupEntry[] => keys.map((key) => ({ key }));

const direct = (
  permissionKey: string,
  scopeType: ScopedDirectPermissionInput["scopeType"],
  scopeId: string,
  cardReadVisibility?: CardReadVisibility,
): ScopedDirectPermissionInput => ({
  permissionKey,
  scopeType,
  scopeId,
  ...(cardReadVisibility ? { cardReadVisibility } : {}),
});

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
    for (const groups of [[], [group(keys("card.read"), "project", PROJECT)], [group(keys("milestone.create"), "milestone", MS_B)]]) {
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
        groupAssignments: [group(keys("card.move"), scopeType, scopeId), group(keys("milestone.create"), scopeType, scopeId)],
        hierarchy: H_FULL,
      });
      expect(effective.grantedKeys.has("card.move"), scopeType).toBe(true);
      expect(effective.grantedKeys.has("milestone.create"), scopeType).toBe(true);
      expect(effective.grantedKeys.size).toBe(2);
    }
  });

  it("[BR-043] per-operasi: hanya key yang di-grant yang muncul, tidak ada efek silang antar key", () => {
    const effective = resolve({ groupAssignments: [group(keys("card.read"), "project", PROJECT)] });
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
      const effective = resolve({ groupAssignments: [group(keys("board.update"), "project", PROJECT)], hierarchy });
      expect(effective.grantedKeys.has("board.update")).toBe(true);
    }
  });

  it("[BR-042][negatif eksplisit] Grant scope Milestone A TIDAK berlaku untuk entity di Milestone B (Project sama)", () => {
    const underB: PermissionHierarchyInput = { projectId: PROJECT, milestoneId: MS_B };
    for (const hierarchy of [underB, { projectId: PROJECT }, H_FULL]) {
      const effective = resolve({ groupAssignments: [group(keys("card.move"), "milestone", MS_A)], hierarchy });
      if (hierarchy.milestoneId !== MS_A) {
        expect(effective.grantedKeys.size, JSON.stringify(hierarchy)).toBe(0);
      } else {
        expect(effective.grantedKeys.size).toBe(1);
      }
    }
  });

  it("[BR-042][properti] Scope Board/List/Card match persis level-nya; level beda/null → tidak applicable", () => {
    const cases = [
      { scopeType: "board", scopeId: BD_A, hit: H_FULL, miss: { ...H_FULL, boardId: "bd_other" } },
      { scopeType: "list", scopeId: LS_A, hit: H_FULL, miss: { ...H_FULL, listId: null } },
      { scopeType: "card", scopeId: CD_A, hit: H_FULL, miss: { ...H_FULL, cardId: "cd_other" } },
    ] as const;
    for (const c of cases) {
      const hit = resolve({ groupAssignments: [group(keys("card.move"), c.scopeType, c.scopeId)], hierarchy: c.hit });
      expect(hit.grantedKeys.size, c.scopeType).toBe(1);
      const miss = resolve({ groupAssignments: [group(keys("card.move"), c.scopeType, c.scopeId)], hierarchy: c.miss });
      expect(miss.grantedKeys.size, c.scopeType).toBe(0);
    }
  });

  it("[BR-042A] Direct Permission menambah union tanpa mengubah Group grant; scope salah → tidak menambah apa pun", () => {
    const mixed = resolve({
      groupAssignments: [group(keys("card.read"), "project", PROJECT)],
      directAssignments: [direct("milestone.create", "milestone", MS_A)],
    });
    expect(mixed.grantedKeys.size).toBe(2);

    const wrongScope = resolve({
      groupAssignments: [group(keys("card.read"), "project", PROJECT)],
      directAssignments: [direct("milestone.create", "milestone", MS_B)],
    });
    expect(wrongScope.grantedKeys.has("card.read")).toBe(true);
    expect(wrongScope.grantedKeys.has("milestone.create")).toBe(false);
  });
});

describe("resolveEffectivePermissions — cardReadVisibility dari KEDUA sumber grant (BR-040/BR-047/BR-048, Review-CL-02, goal 4.1.1)", () => {
  it("[BR-048][Review-CL-02] visibility MILIK Group applicable ikut dinilai walau tanpa direct card.read", () => {
    const cases = [
      { groupVis: "ASSIGNED_TO_ME", extraDirect: null, expected: "ASSIGNED_TO_ME" },
      { groupVis: "CREATED_BY_ME", extraDirect: null, expected: "CREATED_BY_ME" },
      { groupVis: "ALL", extraDirect: null, expected: "ALL" },
      { groupVis: undefined, extraDirect: "milestone.create", expected: "CREATED_BY_ME" },
    ] as const;
    for (const c of cases) {
      const effective = resolve({
        groupAssignments: [
          group([...(c.groupVis ? [{ key: "card.read", cardReadVisibility: c.groupVis }] : [{ key: "card.read" }])], "project", PROJECT),
        ],
        directAssignments: c.extraDirect ? [direct(c.extraDirect, "project", PROJECT)] : [],
      });
      expect(effective.cardReadVisibility, JSON.stringify(c)).toBe(c.expected);
      expect(effective.grantedKeys.has("card.read")).toBe(true);
    }
  });

  it("[BR-040] Dua Group applicable visibility beda → yang terluas menang (union lintas Group)", () => {
    const effective = resolve({
      groupAssignments: [
        group([{ key: "card.read", cardReadVisibility: "CREATED_BY_ME" }], "project", PROJECT),
        group([{ key: "card.move" }, { key: "card.read", cardReadVisibility: "ALL" }], "milestone", MS_A),
      ],
    });
    expect(effective.cardReadVisibility).toBe("ALL");
    expect(effective.grantedKeys.has("card.move")).toBe(true);
  });

  it("[BR-048] Pair campuran Group+direct visibility beda → terluas menang (properti 4 kombinasi)", () => {
    const combos = [
      ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ASSIGNED_TO_ME"],
      ["ASSIGNED_TO_ME", "ALL", "ALL"],
      ["CREATED_BY_ME", "ALL", "ALL"],
      ["ALL", "CREATED_BY_ME", "ALL"],
    ] as const;
    for (const [gv, dv, widest] of combos) {
      const effective = resolve({
        groupAssignments: [group([{ key: "card.read", cardReadVisibility: gv }, { key: "member.invite" }], "project", PROJECT)],
        directAssignments: [direct("card.read", "milestone", MS_A, dv)],
      });
      expect(effective.cardReadVisibility, `${gv} vs ${dv}`).toBe(widest);
      expect(effective.grantedKeys.has("card.read")).toBe(true);
      expect(effective.grantedKeys.has("member.invite")).toBe(true);
    }
  });

  it("[BR-049] visibility dari grant TIDAK applicable (Group maupun direct) → tidak memengaruhi default", () => {
    const effective = resolve({
      groupAssignments: [group([{ key: "card.read", cardReadVisibility: "ALL" }], "milestone", MS_B)],
      directAssignments: [direct("card.read", "board", "bd_other", "ASSIGNED_TO_ME")],
    });
    expect(effective.grantedKeys.size).toBe(0);
    expect(effective.cardReadVisibility).toBe("CREATED_BY_ME");
  });

  it("[D.3] card.read applicable TANPA visibility eksplisit sama sekali → default CREATED_BY_ME", () => {
    const effective = resolve({ groupAssignments: [group(keys("card.read"), "project", PROJECT)] });
    expect(effective.grantedKeys.has("card.read")).toBe(true);
    expect(effective.cardReadVisibility).toBe("CREATED_BY_ME");
  });
});

describe("resolveEffectivePermissions — kemurnian fungsi (DoD, goal 4.1.1)", () => {
  it("[DoD] Deterministik: input sama → hasil ekuivalen; input tidak dimutasi", () => {
    const input: ResolveEffectivePermissionsInput = {
      allPermissionKeys: ALL_KEYS,
      groupAssignments: [group([{ key: "card.read", cardReadVisibility: "ASSIGNED_TO_ME" }, { key: "card.move" }], "milestone", MS_A)],
      directAssignments: [direct("card.read", "board", BD_A, "ASSIGNED_TO_ME")],
      hierarchy: H_FULL,
      isOwner: false,
    };
    const a = resolveEffectivePermissions(input);
    const b = resolveEffectivePermissions(input);
    expect([...a.grantedKeys].sort()).toEqual([...b.grantedKeys].sort());
    expect(a.cardReadVisibility).toBe(b.cardReadVisibility);
    expect(input.groupAssignments[0]!.permissions).toHaveLength(2);
  });
});

describe("hasPermission — helper call site (goal 4.1.2)", () => {
  it("[BR-043] true hanya untuk key yang di-grant; false untuk key lain dan set kosong", () => {
    const effective = resolve({ groupAssignments: [group(keys("card.read"), "project", PROJECT)] });
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

  it("[BR-048] ALL → semua Card tanpa kecuali (termasuk sumber Group)", () => {
    const filter = resolveCardVisibilityFilter(
      resolve({
        groupAssignments: [group([{ key: "card.read", cardReadVisibility: "ALL" }], "project", PROJECT)],
      }),
      ME,
    );
    expect(cards.filter(filter)).toHaveLength(cards.length);
  });
});
