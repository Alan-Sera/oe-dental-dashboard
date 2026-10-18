import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

import { getClinicSettings } from "@/lib/actions/settings.actions";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";

type PatientWithPaymentSheets = {
  localFolderRelativePath: string | null;
  paymentHistorySheets: Array<{
    id: string;
    googleFileId: string | null;
    versions: Array<{ sourceSha256: string | null; googleFileId: string | null }>;
    attachment: { localRelativePath: string };
  }>;
};

export async function sha256File(filePath: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

export async function getPatientPaymentFileStates(patient: PatientWithPaymentSheets) {
  if (!patient.localFolderRelativePath || !patient.paymentHistorySheets.some((sheet) => sheet.googleFileId)) {
    return [];
  }
  const settings = await getClinicSettings();
  if (!settings.patientsRootPath) return [];
  const states: Array<{ sheetId: string; state: "changed" | "unverified"; sourceHash: string }> = [];
  for (const sheet of patient.paymentHistorySheets) {
    if (!sheet.googleFileId) continue;
    try {
      const absolutePath = resolveLinkedAttachmentPath({
        patientsRootPath: settings.patientsRootPath,
        patientFolderRelativePath: patient.localFolderRelativePath,
        localRelativePath: sheet.attachment.localRelativePath
      });
      const sourceHash = await sha256File(absolutePath);
      const currentVersion = sheet.versions.find((version) => version.googleFileId === sheet.googleFileId);
      if (!currentVersion?.sourceSha256) {
        states.push({ sheetId: sheet.id, state: "unverified", sourceHash });
      } else if (currentVersion.sourceSha256 !== sourceHash) {
        states.push({ sheetId: sheet.id, state: "changed", sourceHash });
      }
    } catch {
      // Missing files are reported by the linked-files check.
    }
  }
  return states;
}
