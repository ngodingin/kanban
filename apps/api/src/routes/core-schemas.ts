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

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
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
