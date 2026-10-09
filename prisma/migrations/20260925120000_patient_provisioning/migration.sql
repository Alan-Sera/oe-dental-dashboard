ALTER TABLE "Patient" ADD COLUMN "phoneUnavailable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Patient" ADD COLUMN "googleFolderId" TEXT;
ALTER TABLE "Patient" ADD COLUMN "googleFolderUrl" TEXT;
ALTER TABLE "Patient" ADD COLUMN "provisioningStatus" TEXT NOT NULL DEFAULT 'UNMANAGED';
ALTER TABLE "Patient" ADD COLUMN "provisioningError" TEXT;
ALTER TABLE "Patient" ADD COLUMN "provisioningStartedAt" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "provisionedAt" DATETIME;
ALTER TABLE "Patient" ADD COLUMN "provisioningAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Patient" ADD COLUMN "creationRequestId" TEXT;

CREATE TABLE IF NOT EXISTS "GoogleOAuthAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "stateHash" TEXT NOT NULL,
  "codeVerifierEncrypted" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "returnTo" TEXT NOT NULL,
  "expiresAt" DATETIME NOT NULL,
  "consumedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "GoogleOAuthAttempt_stateHash_key" ON "GoogleOAuthAttempt"("stateHash");
CREATE INDEX IF NOT EXISTS "GoogleOAuthAttempt_expiresAt_idx" ON "GoogleOAuthAttempt"("expiresAt");
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_creationRequestId_key" ON "Patient"("creationRequestId");

UPDATE "Patient"
SET
  "googleFolderId" = (
    SELECT "googleFolderId"
    FROM "PaymentHistorySheet"
    WHERE
      "PaymentHistorySheet"."patientId" = "Patient"."id"
      AND "PaymentHistorySheet"."isActive" = true
      AND "PaymentHistorySheet"."googleFolderId" IS NOT NULL
    ORDER BY "PaymentHistorySheet"."createdAt" DESC
    LIMIT 1
  ),
  "googleFolderUrl" = 'https://drive.google.com/drive/folders/' || (
    SELECT "googleFolderId"
    FROM "PaymentHistorySheet"
    WHERE
      "PaymentHistorySheet"."patientId" = "Patient"."id"
      AND "PaymentHistorySheet"."isActive" = true
      AND "PaymentHistorySheet"."googleFolderId" IS NOT NULL
    ORDER BY "PaymentHistorySheet"."createdAt" DESC
    LIMIT 1
  )
WHERE EXISTS (
  SELECT 1
  FROM "PaymentHistorySheet"
  WHERE
    "PaymentHistorySheet"."patientId" = "Patient"."id"
    AND "PaymentHistorySheet"."isActive" = true
    AND "PaymentHistorySheet"."googleFolderId" IS NOT NULL
);
