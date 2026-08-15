import { titleCaseName } from "@/lib/utils";

export const attachmentCategoryValues = [
  "PHOTO",
  "RADIOGRAPH",
  "CLINICAL_HISTORY",
  "PAYMENT_RECEIPT",
  "OTHER"
] as const;

export type AttachmentCategoryValue = (typeof attachmentCategoryValues)[number];

export type ImportCandidateInput = {
  relativePath: string;
  fileName: string;
  mimeType?: string;
};

export function normalizeRelativePath(relativePath: string) {
  return relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function extractPatientName(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const firstSegment = normalized.split("/").filter(Boolean)[0] ?? "Sin nombre";
  const withoutLeadingNumbers = firstSegment.replace(/^\d+\s*[-_.]?\s*/, "");

  return titleCaseName(withoutLeadingNumbers || firstSegment);
}

export function classifyAttachment(input: ImportCandidateInput): AttachmentCategoryValue {
  const normalizedPath = normalizeRelativePath(input.relativePath).toLowerCase();
  const fileName = input.fileName.toLowerCase();
  const mimeType = input.mimeType?.toLowerCase() ?? "";

  if (
    includesAny(normalizedPath, [
      "rx",
      "xray",
      "x-ray",
      "radiografia",
      "radiografía",
      "panoramica",
      "panorámica",
      "cbct",
      "tomografia",
      "tomografía"
    ])
  ) {
    return "RADIOGRAPH";
  }

  if (
    includesAny(normalizedPath, [
      "pago",
      "pagos",
      "abono",
      "recibo",
      "factura",
      "receipt",
      "payment",
      "cuenta",
      "cobro"
    ])
  ) {
    return "PAYMENT_RECEIPT";
  }

  if (
    includesAny(normalizedPath, [
      "historia",
      "clinica",
      "clínica",
      "expediente",
      "odontograma",
      "anamnesis",
      "consent",
      "consentimiento",
      "tratamiento",
      "nota"
    ])
  ) {
    return "CLINICAL_HISTORY";
  }

  if (
    mimeType.startsWith("image/") ||
    includesAny(fileName, ["foto", "photo", "imagen", "sonrisa", "intraoral", "before", "after"])
  ) {
    return "PHOTO";
  }

  return "OTHER";
}

export function classifyImportCandidate(input: ImportCandidateInput) {
  const relativePath = normalizeRelativePath(input.relativePath || input.fileName);

  return {
    relativePath,
    patientName: extractPatientName(relativePath),
    category: classifyAttachment({ ...input, relativePath })
  };
}

function includesAny(value: string, keywords: string[]) {
  return keywords.some((keyword) => value.includes(keyword));
}
