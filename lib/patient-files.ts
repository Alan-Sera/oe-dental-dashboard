import { constants } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  CLINICAL_HISTORY_FILE_NAME,
  PATIENT_FOLDER_NAMES,
  PAYMENT_HISTORY_FILE_NAME
} from "@/lib/patient-provisioning";

export async function createPatientFileScaffold(input: {
  rootPath: string;
  stableFolderName: string;
  clinicalText: string;
  templatePath: string;
}) {
  const patientFolderPath = path.join(input.rootPath, input.stableFolderName);
  await mkdir(patientFolderPath, { recursive: true });
  await Promise.all(
    Object.values(PATIENT_FOLDER_NAMES).map((folderName) =>
      mkdir(path.join(patientFolderPath, folderName), { recursive: true })
    )
  );

  const clinicalFilePath = path.join(
    patientFolderPath,
    PATIENT_FOLDER_NAMES.clinical,
    CLINICAL_HISTORY_FILE_NAME
  );
  const paymentFilePath = path.join(
    patientFolderPath,
    PATIENT_FOLDER_NAMES.payments,
    PAYMENT_HISTORY_FILE_NAME
  );

  await writeFileIfMissing(clinicalFilePath, input.clinicalText);
  await copyFileIfMissing(input.templatePath, paymentFilePath);

  return { patientFolderPath, clinicalFilePath, paymentFilePath };
}

export async function readTextFileContent(filePath: string) {
  return readFile(filePath, "utf8");
}

async function writeFileIfMissing(filePath: string, content: string) {
  try {
    await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
}

async function copyFileIfMissing(sourcePath: string, targetPath: string) {
  try {
    await copyFile(sourcePath, targetPath, constants.COPYFILE_EXCL);
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error;
  }
}

function isAlreadyExistsError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}
