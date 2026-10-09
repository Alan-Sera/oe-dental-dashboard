import { describe, expect, it } from "vitest";

import {
  attachmentMetadataChanged,
  createInitialClinicalHistory,
  createProvisioningClaim,
  createStablePatientFolderName,
  isProvisioningInProgress,
  normalizePatientIdentity,
  resolveInitialPhoneUnavailable,
  resolveProvisioningCompletion,
  sanitizeWindowsPathSegment
} from "@/lib/patient-provisioning";

describe("patient provisioning helpers", () => {
  it("sanitizes invalid and reserved Windows folder names", () => {
    expect(sanitizeWindowsPathSegment('Ana <Ruiz>: "Dental". ')).toBe("Ana Ruiz Dental");
    expect(sanitizeWindowsPathSegment("CON")).toBe("Paciente CON");
    expect(sanitizeWindowsPathSegment("LPT1.txt")).toBe("Paciente LPT1.txt");
  });

  it("uses a stable short id and caps the folder segment length", () => {
    const folder = createStablePatientFolderName("A".repeat(180), "cm123456789");
    expect(folder).toMatch(/ \[456789\]$/);
    expect(folder.length).toBeLessThanOrEqual(100);
  });

  it("normalizes patient names for duplicate detection", () => {
    expect(normalizePatientIdentity("  María   López-Núñez ")).toBe("maria lopez nunez");
  });

  it("creates a UTF-8 clinical snapshot with explicit missing phone", () => {    const text = createInitialClinicalHistory({
      fullName: "María López",
      birthDate: "1990-03-04",
      gender: "FEMENINO",
      phoneUnavailable: true,
      email: "maria@example.com",
      notes: "Alergia declarada"
    });

    expect(text).toContain("Nombre: María López");
    expect(text).toContain("Teléfono: No disponible (confirmado)");
    expect(text).toContain("Alergia declarada");
    expect(text).toContain("\r\n");
  });

  it("automarks phone as unavailable when editing a patient without phone", () => {
    expect(resolveInitialPhoneUnavailable({})).toBe(false);
    expect(resolveInitialPhoneUnavailable({ phoneUnavailable: true })).toBe(true);
    expect(
      resolveInitialPhoneUnavailable({ patientId: "p1", phone: "983 123 4567" })
    ).toBe(false);
    expect(resolveInitialPhoneUnavailable({ patientId: "p1", phone: "" })).toBe(true);
    expect(resolveInitialPhoneUnavailable({ patientId: "p1" })).toBe(true);
    expect(
      resolveInitialPhoneUnavailable({ patientId: "p1", phoneUnavailable: true })
    ).toBe(true);
  });

  it("preserves provisionedAt and distinguishes partial from failed completions", () => {
    expect(resolveProvisioningCompletion("READY")).toEqual({
      preserveProvisionedAt: false,
      auditEvent: "patient.provisioning_completed",
      retryable: false
    });
    expect(resolveProvisioningCompletion("PARTIAL")).toEqual({
      preserveProvisionedAt: true,
      auditEvent: "patient.provisioning_partial",
      retryable: true
    });
    expect(resolveProvisioningCompletion("FAILED")).toEqual({
      preserveProvisionedAt: true,
      auditEvent: "patient.provisioning_failed",
      retryable: true
    });
  });

  it("treats recent provisioning as active and stale attempts as recoverable", () => {
    const now = Date.parse("2026-10-08T12:00:00.000Z");
    const recent = "2026-10-08T11:58:00.000Z";
    const stale = "2026-10-08T11:54:59.000Z";

    expect(isProvisioningInProgress("PENDING", null, recent, now)).toBe(true);
    expect(isProvisioningInProgress("IN_PROGRESS", recent, null, now)).toBe(true);
    expect(isProvisioningInProgress("PENDING", null, stale, now)).toBe(false);
    expect(isProvisioningInProgress("IN_PROGRESS", stale, null, now)).toBe(false);
    expect(isProvisioningInProgress("PENDING", null, null, now)).toBe(true);
    expect(isProvisioningInProgress("READY", recent, null, now)).toBe(false);
    expect(isProvisioningInProgress("PARTIAL", recent, null, now)).toBe(false);
    expect(isProvisioningInProgress("FAILED", recent, null, now)).toBe(false);
    expect(isProvisioningInProgress("UNMANAGED", recent, null, now)).toBe(false);
    expect(isProvisioningInProgress(null, recent, null, now)).toBe(false);
    expect(isProvisioningInProgress(undefined, recent, null, now)).toBe(false);
  });

  it("builds a compare-and-set claim tied to the observed provisioning attempt", () => {
    const startedAt = new Date("2026-10-08T11:54:00.000Z");
    const claim = createProvisioningClaim(
      { id: "patient-1", provisioningStatus: "IN_PROGRESS", provisioningStartedAt: startedAt },
      new Date("2026-10-08T12:00:00.000Z")
    );

    expect(claim.where).toEqual({
      id: "patient-1",
      provisioningStatus: "IN_PROGRESS",
      provisioningStartedAt: startedAt
    });
    expect(claim.data).toEqual({
      provisioningStatus: "IN_PROGRESS",
      provisioningError: null,
      provisioningStartedAt: new Date("2026-10-08T12:00:00.000Z"),
      provisioningAttempts: { increment: 1 }
    });
  });

  it("detects changed attachment metadata for refresh", () => {
    const stored = {
      originalName: "Historial de pagos.xlsx",
      sourceRelativePath: "Ana [ABC123]/Historial de pagos/Historial de pagos.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 1024
    };

    expect(attachmentMetadataChanged(stored, stored)).toBe(false);
    expect(attachmentMetadataChanged(stored, { ...stored, sizeBytes: 2048 })).toBe(true);
    expect(attachmentMetadataChanged(stored, { ...stored, mimeType: "text/plain" })).toBe(true);
    expect(
      attachmentMetadataChanged(
        { ...stored, mimeType: null },
        { ...stored, mimeType: stored.mimeType }
      )
    ).toBe(true);
    expect(
      attachmentMetadataChanged(
        { ...stored, originalName: "Renombrado.xlsx" },
        stored
      )
    ).toBe(true);
  });
});
