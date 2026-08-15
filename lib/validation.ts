import { z } from "zod";

export const setupSchema = z
  .object({
    clinicName: z.string().min(2, "Escribe el nombre de la clínica").max(80),
    currency: z.string().length(3, "Usa una moneda ISO de 3 letras").toUpperCase(),
    password: z.string().min(8, "Usa al menos 8 caracteres"),
    confirmPassword: z.string().min(8, "Confirma la contraseña")
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden"
  });

export const loginSchema = z.object({
  password: z.string().min(1, "Ingresa tu contraseña")
});

export const patientSchema = z.object({
  fullName: z.string().min(2, "Escribe el nombre del paciente").max(120),
  email: z.string().email("Correo inválido").optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  birthDate: z.string().optional().or(z.literal("")),
  notes: z.string().max(2000).optional().or(z.literal(""))
});

export const clinicalEntrySchema = z.object({
  patientId: z.string().min(1),
  entryDate: z.string().min(1, "Selecciona una fecha"),
  tooth: z.string().max(20).optional().or(z.literal("")),
  diagnosis: z.string().max(500).optional().or(z.literal("")),
  treatment: z.string().max(500).optional().or(z.literal("")),
  notes: z.string().min(2, "Agrega una nota clínica").max(4000)
});

export const treatmentChargeSchema = z.object({
  patientId: z.string().min(1),
  description: z.string().min(2, "Describe el tratamiento").max(200),
  amount: z.string().min(1, "Ingresa el monto"),
  serviceDate: z.string().min(1, "Selecciona una fecha"),
  status: z.enum(["OPEN", "PAID", "VOID"]),
  notes: z.string().max(1000).optional().or(z.literal(""))
});

export const paymentSchema = z.object({
  patientId: z.string().min(1),
  amount: z.string().min(1, "Ingresa el monto"),
  paidAt: z.string().min(1, "Selecciona una fecha"),
  method: z.string().min(2, "Indica el método de pago").max(80),
  status: z.enum(["CONFIRMED", "PENDING", "VOID"]),
  notes: z.string().max(1000).optional().or(z.literal(""))
});

export const settingsSchema = z.object({
  clinicName: z.string().min(2, "Escribe el nombre de la clínica").max(80),
  currency: z.string().length(3, "Usa una moneda ISO de 3 letras").toUpperCase(),
  networkMode: z.enum(["single", "lan-ready"])
});

export const importCandidateSchema = z.object({
  candidateId: z.string().min(1),
  patientName: z.string().min(1),
  category: z.enum(["PHOTO", "RADIOGRAPH", "CLINICAL_HISTORY", "PAYMENT_RECEIPT", "OTHER"]),
  originalName: z.string().min(1),
  sourceRelativePath: z.string().min(1),
  sha256: z.string().min(32),
  sizeBytes: z.coerce.number().int().nonnegative(),
  mimeType: z.string().optional().or(z.literal("")),
  paymentAmount: z.string().optional().or(z.literal("")),
  paymentMethod: z.string().optional().or(z.literal("")),
  paymentDate: z.string().optional().or(z.literal(""))
});

export const createImportBatchSchema = z.object({
  sourceRootName: z.string().min(1),
  items: z.array(importCandidateSchema).min(1)
});

export type SetupInput = z.infer<typeof setupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type PatientInput = z.infer<typeof patientSchema>;
export type ClinicalEntryInput = z.infer<typeof clinicalEntrySchema>;
export type TreatmentChargeInput = z.infer<typeof treatmentChargeSchema>;
export type PaymentInput = z.infer<typeof paymentSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
