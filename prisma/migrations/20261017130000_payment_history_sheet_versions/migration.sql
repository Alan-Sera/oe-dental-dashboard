CREATE TABLE "PaymentHistorySheetVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheetId" TEXT NOT NULL,
    "sourceSha256" TEXT,
    "sourceSizeBytes" INTEGER,
    "sourceModifiedAt" DATETIME,
    "googleFileId" TEXT,
    "googleUrl" TEXT,
    "googleFolderId" TEXT,
    "uploadStatus" TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
    "errorMessage" TEXT,
    "uploadedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymentHistorySheetVersion_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "PaymentHistorySheet" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PaymentHistorySheetVersion_sheetId_createdAt_idx" ON "PaymentHistorySheetVersion"("sheetId", "createdAt");

INSERT INTO "PaymentHistorySheetVersion" (
    "id", "sheetId", "googleFileId", "googleUrl", "googleFolderId", "uploadStatus", "uploadedAt", "createdAt"
)
SELECT lower(hex(randomblob(16))), "id", "googleFileId", "googleUrl", "googleFolderId",
       "uploadStatus", "uploadedAt", COALESCE("uploadedAt", "createdAt")
FROM "PaymentHistorySheet"
WHERE "googleFileId" IS NOT NULL;
