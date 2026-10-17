import { z } from "zod";

import {
  ALL_TEETH,
  recordIsValid,
  TREATMENTS,
  type DentalRecord,
  type TreatmentCode,
} from "@/lib/odontogram";

const SURFACES = ["M", "D", "V", "L", "O", "I"] as const;
const PHASES = ["previous", "current"] as const;
const STATUSES = ["pending", "in_progress", "completed"] as const;
const TREATMENT_CODES = TREATMENTS.map(({ code }) => code) as [
  TreatmentCode,
  ...TreatmentCode[],
];

const identifierSchema = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

const odontogramRecordSchema = z.object({
  id: identifierSchema,
  tooth: z.enum(ALL_TEETH),
  treatment: z.enum(TREATMENT_CODES),
  surfaces: z.array(z.enum(SURFACES)).max(SURFACES.length),
  phase: z.enum(PHASES),
  status: z.enum(STATUSES),
  notes: z.string().max(1000).transform((notes) => notes.trim()),
  createdAt: z.string().datetime(),
}).strict().superRefine((record, context) => {
  if (!recordIsValid(record as DentalRecord)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["surfaces"],
      message: "La pieza, tratamiento y superficies seleccionados no son compatibles.",
    });
  }
});

export const odontogramRecordsInputSchema = z.array(odontogramRecordSchema)
  .max(1000, "El odontograma excede el límite de registros permitido.")
  .superRefine((records, context) => {
    const ids = new Set<string>();

    records.forEach((record, index) => {
      if (ids.has(record.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "id"],
          message: "El odontograma contiene registros con identificadores repetidos.",
        });
      }
      ids.add(record.id);
    });
  });

export const odontogramPatientIdSchema = identifierSchema;
export const odontogramRevisionSchema = z.number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
