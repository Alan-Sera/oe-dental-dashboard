import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { createPatientFileScaffold, readTextFileContent } from "@/lib/patient-files";
import { PATIENT_FOLDER_NAMES } from "@/lib/patient-provisioning";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("patient file scaffold", () => {
  it("creates the exact structure and copies the template byte-for-byte", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "oe-patient-files-"));
    temporaryDirectories.push(rootPath);
    const templatePath = path.join(rootPath, "template.xlsx");
    const template = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xde, 0xad, 0xbe, 0xef]);
    await writeFile(templatePath, template);

    const result = await createPatientFileScaffold({
      rootPath,
      stableFolderName: "Ana Ruiz [ABC123]",
      clinicalText: "Ficha inicial con acentos: clínica",
      templatePath
    });

    expect((await readdir(result.patientFolderPath)).sort()).toEqual(
      Object.values(PATIENT_FOLDER_NAMES).sort()
    );
    expect(await readFile(result.clinicalFilePath, "utf8")).toBe("Ficha inicial con acentos: clínica");
    expect(await readFile(result.paymentFilePath)).toEqual(template);
  });

  it("never overwrites files that already exist", async () => {    const rootPath = await mkdtemp(path.join(os.tmpdir(), "oe-patient-files-"));
    temporaryDirectories.push(rootPath);
    const templatePath = path.join(rootPath, "template.xlsx");
    await writeFile(templatePath, "first-template");
    const input = {
      rootPath,
      stableFolderName: "Ana Ruiz [ABC123]",
      clinicalText: "first-history",
      templatePath
    };
    const first = await createPatientFileScaffold(input);

    await writeFile(templatePath, "second-template");
    await createPatientFileScaffold({ ...input, clinicalText: "second-history" });

    expect(await readFile(first.clinicalFilePath, "utf8")).toBe("first-history");
    expect(await readFile(first.paymentFilePath, "utf8")).toBe("first-template");
  });

  it("round-trips clinical text byte-identically so the file can source the database snapshot", async () => {
    const rootPath = await mkdtemp(path.join(os.tmpdir(), "oe-patient-files-"));
    temporaryDirectories.push(rootPath);
    const templatePath = path.join(rootPath, "template.xlsx");
    await writeFile(templatePath, "template");
    const clinicalText =
      "HISTORIA CLÍNICA — FICHA INICIAL\r\n\r\nNombre: María López\r\nAcentos: clínica\r\n";

    const result = await createPatientFileScaffold({
      rootPath,
      stableFolderName: "María López [ABC123]",
      clinicalText,
      templatePath
    });

    await expect(readTextFileContent(result.clinicalFilePath)).resolves.toBe(clinicalText);
  });
});
