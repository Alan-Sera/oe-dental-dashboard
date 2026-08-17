import type {
  AttachmentCategory,
  ChargeStatus,
  PaymentHistoryUploadStatus,
  PaymentStatus
} from "@prisma/client";

export type ImportPreviewFile = {
  id: string;
  file: File;
  relativePath: string;
  patientName: string;
  category: AttachmentCategory;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  duplicateInBatch: boolean;
  paymentAmount?: string;
  paymentMethod?: string;
  paymentDate?: string;
};

export type SerializedAttachment = {
  id: string;
  category: AttachmentCategory;
  originalName: string;
  mimeType: string | null;
  sizeBytes: number;
  sourceRelativePath: string;
  importedAt: string;
};

export type SerializedPatientDetail = {
  id: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  notes: string | null;
  attachments: SerializedAttachment[];
  clinicalEntries: Array<{
    id: string;
    entryDate: string;
    tooth: string | null;
    diagnosis: string | null;
    treatment: string | null;
    notes: string;
    attachments: SerializedAttachment[];
  }>;
  charges: Array<{
    id: string;
    description: string;
    amountCents: number;
    currency: string;
    serviceDate: string;
    status: ChargeStatus;
    notes: string | null;
    attachments: SerializedAttachment[];
  }>;
  payments: Array<{
    id: string;
    amountCents: number;
    currency: string;
    paidAt: string;
    method: string;
    status: PaymentStatus;
    notes: string | null;
    attachments: SerializedAttachment[];
  }>;
  paymentHistorySheets: Array<{
    id: string;
    patientId: string;
    attachmentId: string;
    googleFileId: string | null;
    googleUrl: string | null;
    googleFolderId: string | null;
    uploadStatus: PaymentHistoryUploadStatus;
    uploadedAt: string | null;
    errorMessage: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    attachment: SerializedAttachment;
  }>;
};
