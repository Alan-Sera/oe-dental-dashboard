PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS "Odontogram" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "patientId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Odontogram_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Odontogram_patientId_key" ON "Odontogram"("patientId");

CREATE TABLE IF NOT EXISTS "OdontogramRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "odontogramId" TEXT NOT NULL,
    "tooth" TEXT NOT NULL,
    "treatment" TEXT NOT NULL,
    "phase" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "retiredAt" DATETIME,
    CONSTRAINT "OdontogramRecord_odontogramId_fkey" FOREIGN KEY ("odontogramId") REFERENCES "Odontogram" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OdontogramRecord_odontogramId_retiredAt_createdAt_idx" ON "OdontogramRecord"("odontogramId", "retiredAt", "createdAt");
CREATE INDEX IF NOT EXISTS "OdontogramRecord_odontogramId_tooth_idx" ON "OdontogramRecord"("odontogramId", "tooth");

CREATE TABLE IF NOT EXISTS "OdontogramSurface" (
    "recordId" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    CONSTRAINT "OdontogramSurface_pkey" PRIMARY KEY ("recordId", "surface"),
    CONSTRAINT "OdontogramSurface_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "OdontogramRecord" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
