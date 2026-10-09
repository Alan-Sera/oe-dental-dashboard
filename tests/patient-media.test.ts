import { describe, expect, it } from "vitest";

import { isPatientPhotoOrRadiograph } from "@/lib/patient-media";

describe("patient media filter", () => {
  it("includes image attachments categorized as photos or radiographs", () => {
    expect(isPatientPhotoOrRadiograph({ category: "PHOTO", mimeType: "image/jpeg" })).toBe(true);
    expect(isPatientPhotoOrRadiograph({ category: "RADIOGRAPH", mimeType: "IMAGE/PNG" })).toBe(true);
  });

  it("keeps non-images such as zip files out of the Photos tab", () => {
    expect(isPatientPhotoOrRadiograph({ category: "RADIOGRAPH", mimeType: "application/octet-stream" })).toBe(false);
    expect(isPatientPhotoOrRadiograph({ category: "PHOTO", mimeType: "application/zip" })).toBe(false);
    expect(isPatientPhotoOrRadiograph({ category: "RADIOGRAPH", mimeType: null })).toBe(false);
  });

  it("does not show other image attachments as photos", () => {
    expect(isPatientPhotoOrRadiograph({ category: "OTHER", mimeType: "image/jpeg" })).toBe(false);
  });
});
