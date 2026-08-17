PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS "PaymentHistorySheet" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "attachmentId" TEXT NOT NULL,
    "googleFileId" TEXT,
    "googleUrl" TEXT,
    "googleFolderId" TEXT,
    "uploadStatus" TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
    "uploadedAt" DATETIME,
    "errorMessage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PaymentHistorySheet_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PaymentHistorySheet_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "Attachment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaymentHistorySheet_attachmentId_key" ON "PaymentHistorySheet"("attachmentId");
CREATE INDEX IF NOT EXISTS "PaymentHistorySheet_patientId_isActive_idx" ON "PaymentHistorySheet"("patientId", "isActive");
CREATE INDEX IF NOT EXISTS "PaymentHistorySheet_patientId_createdAt_idx" ON "PaymentHistorySheet"("patientId", "createdAt");
