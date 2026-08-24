/**
 * TASK-6.2.1 — Skema Zod eksplisit untuk payload core (C.5/C.8).
 *
 * Satu titik definisi per entity: tipe, required/optional, dan batas
 * (title trim non-kosong, progress 0–100, expectedVersion ≥1, dst).
 * Pesan validasi dipertahankan identik dengan parser manual yang diganti
 * agar kontrak error terhadap client tidak berubah.
 *
 * Bridge `parseBody` memetakan ZodError → PipelineError VALIDATION_ERROR
 * dengan `details` collect-all (semantik TASK-0.17.4 — SATU mekanisme,
 * bukan yang kedua; Zod mengumpulkan seluruh issue sekaligus secara native).
 */
import { z } from "zod";
import { PipelineError } from "@kanban/infrastructure";

export function parseBody<S extends z.ZodType>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((iss) => ({
      field: iss.path.length > 0 ? iss.path.map(String).join(".") : "(root)",
      reason: iss.message,
    }));
    throw new PipelineError("VALIDATION_ERROR", "Validasi payload gagal, lihat details.", 400, details);
  }
  return result.data;
}

// ---------- primitif reusable ----------

/** String wajib non-kosong setelah trim (hasil sudah di-trim). */
const trimmedRequired = (field: string) =>
  z
    .string({ message: `Field ${field} wajib string non-kosong.` })
    .transform((v) => v.trim())
    .refine((v) => v.length > 0, `Field ${field} wajib string non-kosong.`);

/** String opsional: undefined | null | string (pesan invalid-type konsisten). */
const optionalStringNull = (field: string) =>
  z
    .union([z.null(), z.string({ message: `Field ${field} wajib string atau null.` })])
    .nullish();

/** Integer ≥ 1 (expectedVersion). */
export const expectedVersionSchema = z
  .number({ message: "Field expectedVersion wajib integer >= 1." })
  .int("Field expectedVersion wajib integer >= 1.")
  .min(1, "Field expectedVersion wajib integer >= 1.");

// ---------- Milestone (C.5) ----------

export const milestoneCreateSchema = z.object({
  title: trimmedRequired("title"),
  description: optionalStringNull("description"),
  progress: z
    .number({ message: "Field progress wajib integer 0–100." })
    .int("Field progress wajib integer 0–100.")
    .min(0, "Field progress wajib integer 0–100.")
    .max(100, "Field progress wajib integer 0–100.")
    .optional(),
  startDate: optionalStringNull("startDate"),
  dueDate: optionalStringNull("dueDate"),
});

export const milestonePatchSchema = z.object({
  expectedVersion: expectedVersionSchema,
  title: trimmedRequired("title").optional(),
  description: optionalStringNull("description"),
  progress: z
    .number({ message: "Field progress wajib integer 0–100." })
    .int("Field progress wajib integer 0–100.")
    .min(0, "Field progress wajib integer 0–100.")
    .max(100, "Field progress wajib integer 0–100.")
    .optional(),
  startDate: optionalStringNull("startDate"),
  dueDate: optionalStringNull("dueDate"),
});

// ---------- Board / List (C.6) ----------

export const boardCreateSchema = z.object({
  title: trimmedRequired("title"),
  description: optionalStringNull("description").default(null),
});

export const boardPatchSchema = z.object({
  expectedVersion: expectedVersionSchema,
  title: trimmedRequired("title").optional(),
  description: optionalStringNull("description"),
});

export const listCreateSchema = z.object({
  title: trimmedRequired("title"),
});

export const listPatchSchema = z.object({
  expectedVersion: expectedVersionSchema,
  title: trimmedRequired("title").optional(),
});

// ---------- Card (C.8) ----------

/** assignee: undefined/null → null; string non-kosong setelah trim. */
const assigneeSchema = z
  .preprocess(
    (v) => (v === undefined ? null : v),
    z.union([
      z.null(),
      z
        .string({ message: "Field assignee wajib string non-kosong atau null." })
        .transform((v) => v.trim())
        .refine((v) => v.length > 0, "Field assignee wajib string non-kosong atau null."),
    ]),
  )
  .default(null);

export const cardCreateSchema = z.object({
  title: trimmedRequired("title"),
  subtitle: optionalStringNull("subtitle"),
  description: optionalStringNull("description"),
  dueDate: optionalStringNull("dueDate"),
  assignee: assigneeSchema,
});

export const cardPatchSchema = z.object({
  expectedVersion: expectedVersionSchema,
  title: trimmedRequired("title").optional(),
  subtitle: optionalStringNull("subtitle"),
  description: optionalStringNull("description"),
  dueDate: optionalStringNull("dueDate"),
  assignee: assigneeSchema.optional(),
});

export const cardMoveSchema = z.object({
  destinationListId: trimmedRequired("destinationListId"),
  expectedVersion: expectedVersionSchema,
});

// ---------- Milestone/Board Label (C.10–C.11) ----------

/** name label — sama semantik trimmedRequired("name"). */
export const labelNameSchema = trimmedRequired("name");

export const labelCreateSchema = z.object({ name: labelNameSchema });

export const labelPatchSchema = z.object({
  expectedVersion: expectedVersionSchema,
  name: labelNameSchema.optional(),
});

// ---------- Card-Label assign (C.11) ----------

export const cardLabelAssignSchema = z.object({
  labelId: trimmedRequired("labelId"),
});

// ---------- Comment (C.9) ----------

export const commentCreateSchema = z.object({
  body: trimmedRequired("body"),
});

// ---------- Permission Group / Assignment / Invitation (C.12–C.13, TASK-6.2.3) ----------

const VISIBILITIES = ["CREATED_BY_ME", "ASSIGNED_TO_ME", "ALL"] as const;

/** Replika setia readPermissionEntries lama — pesan & urutan kegagalan identik. */
export const permissionEntriesSchema = z
  .array(z.unknown(), { message: "Field permissions wajib array." })
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item) => {
      if (typeof item !== "object" || item === null) {
        ctx.addIssue({ code: "custom", message: "Item permissions wajib objek.", path: ["permissions"] });
        return;
      }
      const rec = item as Record<string, unknown>;
      const pid = rec.permissionId;
      if (typeof pid !== "string" || pid.length === 0) {
        ctx.addIssue({ code: "custom", message: "Field permissionId wajib string non-kosong.", path: ["permissions"] });
        return;
      }
      if (seen.has(pid)) {
        ctx.addIssue({ code: "custom", message: `permissionId duplikat: ${pid}`, path: ["permissions"] });
        return;
      }
      seen.add(pid);
      const vis = rec.cardReadVisibility;
      const visStr = typeof vis === "string" ? vis : undefined;
      if (vis !== undefined && vis !== null && (visStr === undefined || !(VISIBILITIES as readonly string[]).includes(visStr))) {
        ctx.addIssue({
          code: "custom",
          message: `cardReadVisibility tidak valid: ${String(vis)}`,
          path: ["permissions"],
        });
      }
    });
  })
  .transform((items) =>
    items.map((item) => {
      const rec = item as Record<string, unknown>;
      return {
        permissionId: String(rec.permissionId),
        cardReadVisibility:
          typeof rec.cardReadVisibility === "string" ? rec.cardReadVisibility : null,
      };
    }),
  );

/** name Permission Group — tanpa trim, maksimal 255 karakter (pesan persis lama). */
export const groupNameSchema = z
  .string({ message: "Field name wajib string." })
  .transform((v) => v.trim())
  .refine((v) => v.length > 0, "Field name tidak boleh kosong.")
  .refine((v) => v.length <= 255, "Field name maksimal 255 karakter.");

export const groupDescriptionSchema = z
  .union([z.null(), z.string({ message: "Field description wajib string atau null." })])
  .transform((v) => (typeof v === "string" ? v.trim() : v));

const nonEmpty = (field: string) =>
  z
    .string({ message: `Field ${field} wajib string non-kosong.` })
    .refine((v) => v.length > 0, `Field ${field} wajib string non-kosong.`);

export const groupCreateSchema = z.object({
  name: groupNameSchema,
  description: groupDescriptionSchema.optional(),
  permissions: permissionEntriesSchema.optional(),
});

export const groupUpdateSchema = z.object({
  name: groupNameSchema.optional(),
  description: groupDescriptionSchema.optional(),
  permissions: permissionEntriesSchema.optional(),
});

export const groupAssignmentCreateSchema = z.object({
  groupId: nonEmpty("groupId"),
  scopeType: nonEmpty("scopeType"),
  scopeId: nonEmpty("scopeId"),
});

export const permissionAssignmentCreateSchema = z.object({
  permissionId: nonEmpty("permissionId"),
  scopeType: nonEmpty("scopeType"),
  scopeId: nonEmpty("scopeId"),
  cardReadVisibility: z
    .union([z.null(), z.string({ message: "cardReadVisibility wajib string atau null." })])
    .optional(),
});

/**
 * Invitation create — factory karena scopeId default bergantung projectId
 * (paritas perilaku lama). Urutan deklarasi assignments→expiresAt sengaja:
 * menentukan urutan `details` yang di-assert test Phase 1.
 */
export const invitationCreateSchema = (projectId: string) =>
  z.object({
    assignments: z
      .array(
        z.object({
          groupId: nonEmpty("Setiap assignment wajib memiliki groupId string non-kosong.").or(
            z.never({ message: "Setiap assignment wajib memiliki groupId string non-kosong." }),
          ),
          scopeType: z.string().default("project"),
          scopeId: z.string().default(projectId),
        }),
        { message: "Field assignments wajib array (minimal satu item — BR-051)." },
      )
      .min(1, "Field assignments wajib array (minimal satu item — BR-051)."),
    expiresAt: z
      .union([z.null(), z.string({ message: "expiresAt wajib string atau null." })])
      .optional(),
  });

// ---------- API Key & PAT (C.14, TASK-6.2.3) ----------

export const apiKeyCreateSchema = z
  .object({
    name: z
      .string({ message: "Field name wajib string non-kosong." })
      .refine((v) => v.trim().length > 0, "Field name wajib string non-kosong."),
    expiresAt: z
      .union([z.null(), z.string({ message: "expiresAt wajib string ISO date-time." })])
      .optional(),
  });

export const patCreateSchema = z
  .object({
    name: z
      .string({ message: "Field name wajib string non-kosong." })
      .refine((v) => v.trim().length > 0, "Field name wajib string non-kosong."),
    expiresAt: z
      .union([z.null(), z.string({ message: "expiresAt wajib string ISO date-time." })])
      .optional(),
  });

/**
 * Bridge khusus credential (C.14): mempertahankan kontrak detail lama —
 * setiap field tak dikenal menghasilkan SATU entri `unknownField:<key>`
 * (collect-all), digabung dengan issue field known dari Zod.
 */
export function parseCredentialBody<S extends z.ZodType>(
  schema: S,
  body: unknown,
  knownKeys: readonly string[],
): z.output<S> {
  const rawObj = (body ?? {}) as Record<string, unknown>;
  const result = schema.safeParse(rawObj);
  const details: Array<{ field: string; reason: string }> = [];
  if (!result.success) {
    for (const iss of result.error.issues) {
      const key = iss.path.map(String).join(".");
      if (!key || knownKeys.includes(key)) {
        details.push({ field: key || "(root)", reason: iss.message });
      }
    }
  }
  for (const k of Object.keys(rawObj)) {
    if (!knownKeys.includes(k)) {
      details.push({ field: `unknownField:${k}`, reason: "Field tidak dikenal." });
    }
  }
  if (details.length > 0) {
    throw new PipelineError("VALIDATION_ERROR", "Validasi payload gagal, lihat details.", 400, details);
  }
  return result.data!;
}
