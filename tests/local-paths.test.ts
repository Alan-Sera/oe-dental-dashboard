import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  normalizeStoredRelativePath,
  resolveLinkedAttachmentPath
} from "@/lib/local-paths";

describe("local linked paths", () => {
  it("normalizes stored relative paths", () => {
    expect(normalizeStoredRelativePath("Ana Ruiz\\rx\\panoramica.jpg")).toBe(
      "Ana Ruiz/rx/panoramica.jpg"
    );
  });

  it("rejects relative paths that escape the patient folder", () => {
    expect(() => normalizeStoredRelativePath("../secret.jpg")).toThrow();
  });

  it("resolves linked attachments inside the patients root", () => {
    const root = path.join(path.parse(process.cwd()).root, "tmp", "pacientes");

    expect(
      resolveLinkedAttachmentPath({
        patientsRootPath: root,
        patientFolderRelativePath: "Ana Ruiz",
        localRelativePath: "rx/panoramica.jpg"
      })
    ).toBe(path.join(root, "Ana Ruiz", "rx", "panoramica.jpg"));
  });
});
