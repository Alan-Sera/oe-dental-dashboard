import { describe, expect, it } from "vitest";

import {
  createTextHistoryBackupFileName,
  detectPreferredLineEnding,
  isPlainTextAttachment,
  normalizeLineEndings,
  stripByteOrderMark
} from "@/lib/text-attachments";

describe("isPlainTextAttachment", () => {
  it("accepts txt files by extension", () => {
    expect(isPlainTextAttachment("historia-clinica.TXT", null)).toBe(true);
  });

  it("accepts text/plain attachments even when the name has no extension", () => {
    expect(isPlainTextAttachment("historia", "text/plain; charset=utf-8")).toBe(true);
  });

  it("rejects other document types", () => {
    expect(isPlainTextAttachment("historia.pdf", "application/pdf")).toBe(false);
  });

  it("removes a byte order mark from imported text", () => {
    expect(stripByteOrderMark("\uFEFFHistoria clínica")).toBe("Historia clínica");
  });

  it("detects and preserves the dominant line ending", () => {
    const lineEnding = detectPreferredLineEnding("Uno\r\nDos\r\nTres");

    expect(lineEnding).toBe("\r\n");
    expect(normalizeLineEndings("Uno\nDos\nTres", lineEnding)).toBe("Uno\r\nDos\r\nTres");
  });

  it("creates backup file names safe for local filesystems", () => {
    const fileName = createTextHistoryBackupFileName({
      timestamp: new Date("2026-08-25T12:34:56.789Z"),
      patientId: "patient:1",
      attachmentId: "attachment/2",
      originalName: "historia clínica?.txt"
    });

    expect(fileName).toBe("2026-08-25T12-34-56-789Z_patient_1_attachment_2_historia clínica_.txt");
  });
});
