ALTER TABLE "Odontogram" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "OdontogramRecordVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recordId" TEXT NOT NULL,
    "tooth" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "recordCreatedAt" DATETIME NOT NULL,
    "changeType" TEXT NOT NULL,
    "changedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OdontogramRecordVersion_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OdontogramRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OdontogramRecordVersion_recordId_changedAt_idx" ON "OdontogramRecordVersion"("recordId", "changedAt");
CREATE INDEX "OdontogramRecordVersion_changeType_changedAt_idx" ON "OdontogramRecordVersion"("changeType", "changedAt");

CREATE TABLE "OdontogramRecordVersionSurface" (
    "versionId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    CONSTRAINT "OdontogramRecordVersionSurface_pkey" PRIMARY KEY ("versionId", "surface"),
    CONSTRAINT "OdontogramRecordVersionSurface_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "OdontogramRecordVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
