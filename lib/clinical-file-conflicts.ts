import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import { getClinicSettings } from "@/lib/actions/settings.actions";
import { resolveLinkedAttachmentPath } from "@/lib/local-paths";
import { isPlainTextAttachment, linkedTextMatchesClinicalNotes } from "@/lib/text-attachments";

type LinkedTextPatient = {
  localFolderRelativePath: string | null;
  clinicalEntries: Array<{
    notes: string;
    updatedAt: Date;
    attachments: Array<{
      id: string;
      originalName: string;
      mimeType: string | null;
      localRelativePath: string;
    }>;
  }>;
};

export async function getPatientClinicalFileConflicts(patient: LinkedTextPatient) {
  const linkedFiles = patient.clinicalEntries.flatMap((entry) =>
    entry.attachments
      .filter((attachment) => isPlainTextAttachment(attachment.originalName, attachment.mimeType))
      .map((attachment) => ({ attachment, notes: entry.notes, entryUpdatedAt: entry.updatedAt }))
  );
  if (!linkedFiles.length || !patient.localFolderRelativePath) return [];

  const settings = await getClinicSettings();
  if (!settings.patientsRootPath) return [];
  const conflicts: Array<{ attachmentId: string; sourceHash: string; entryUpdatedAt: string }> = [];
  for (const { attachment, notes, entryUpdatedAt } of linkedFiles) {
    try {
      const absolutePath = resolveLinkedAttachmentPath({
        patientsRootPath: settings.patientsRootPath,
        patientFolderRelativePath: patient.localFolderRelativePath,
        localRelativePath: attachment.localRelativePath
      });
      const content = await readFile(absolutePath, "utf8");
      if (!linkedTextMatchesClinicalNotes(content, notes, attachment.originalName)) {
        conflicts.push({
          attachmentId: attachment.id,
          sourceHash: createHash("sha256").update(content).digest("hex"),
          entryUpdatedAt: entryUpdatedAt.toISOString()
        });
      }
    } catch {
      // Missing files are reported by the linked-files check, not as content conflicts.
    }
  }
  return conflicts;
}
