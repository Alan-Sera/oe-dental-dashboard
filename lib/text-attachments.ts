export function isPlainTextAttachment(fileName: string, mimeType?: string | null) {
  const normalizedMimeType = mimeType?.split(";")[0]?.trim().toLowerCase() ?? "";
  const normalizedFileName = fileName.trim().toLowerCase();

  return normalizedMimeType === "text/plain" || normalizedFileName.endsWith(".txt");
}

export function stripByteOrderMark(value: string) {
  return value.replace(/^\uFEFF/, "");
}

export function detectPreferredLineEnding(value: string) {
  const crlfCount = value.match(/\r\n/g)?.length ?? 0;
  const lfCount = (value.replace(/\r\n/g, "").match(/\n/g)?.length ?? 0);

  return crlfCount >= lfCount && crlfCount > 0 ? "\r\n" : "\n";
}

export function normalizeLineEndings(value: string, lineEnding: "\r\n" | "\n") {
  return value.replace(/\r\n|\r|\n/g, "\n").split("\n").join(lineEnding);
}

export function createTextHistoryBackupFileName({
  timestamp,
  patientId,
  attachmentId,
  originalName
}: {
  timestamp: Date;
  patientId: string;
  attachmentId: string;
  originalName: string;
}) {
  const safeTimestamp = timestamp.toISOString().replace(/[:.]/g, "-");
  const safePatientId = sanitizeBackupNamePart(patientId);
  const safeAttachmentId = sanitizeBackupNamePart(attachmentId);
  const safeOriginalName = sanitizeBackupNamePart(originalName) || "historia.txt";

  return `${safeTimestamp}_${safePatientId}_${safeAttachmentId}_${safeOriginalName}`;
}

function sanitizeBackupNamePart(value: string) {
  return value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 140);
}
