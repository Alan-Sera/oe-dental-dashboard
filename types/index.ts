import type {
  AttachmentCategory,
  ChargeStatus,
  PatientGender,
  PaymentHistoryUploadStatus,
  PaymentStatus
} from "@prisma/client";

export type ImportPreviewFile = {
  id: string;
  relativePath: string;
  localRelativePath: string;
  patientName: string;
  category: AttachmentCategory;
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
  localRelativePath: string;
  mimeType: string | null;
  sizeBytes: number;
  sourceRelativePath: string;
  importedAt: string;
  capturedAt: string | null;
  clinicalEntryId: string | null;
};

export type SerializedPatientDetail = {
  id: string;
  createdAt: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  phoneUnavailable: boolean;
  birthDate: string | null;
  gender: PatientGender | null;
  nextAppointmentDate: string | null;
  notes: string | null;
  profilePhotoId: string | null;
  googleFolderId: string | null;
  googleFolderUrl: string | null;
  provisioningStatus: "UNMANAGED" | "PENDING" | "IN_PROGRESS" | "PARTIAL" | "READY" | "FAILED";
  provisioningError: string | null;
  provisioningStartedAt: string | null;
  provisionedAt: string | null;
  provisioningAttempts: number;
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
    uploadStartedAt: string | null;
    uploadedAt: string | null;
    errorMessage: string | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    attachment: SerializedAttachment;
  }>;
};
