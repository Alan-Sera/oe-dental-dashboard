import type { SerializedAttachment } from "@/types";

export function isPatientPhotoOrRadiograph(
  attachment: Pick<SerializedAttachment, "category" | "mimeType">
) {
  return (
    (attachment.category === "PHOTO" || attachment.category === "RADIOGRAPH") &&
    Boolean(attachment.mimeType?.toLowerCase().startsWith("image/"))
  );
}
