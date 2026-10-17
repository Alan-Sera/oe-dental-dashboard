import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findGeneratedPrismaClient } from "../scripts/prisma-client-resolver.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function createClientFixture(
  clientDirectory: string,
  schema: string,
  declarations: string
) {
  await mkdir(clientDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(clientDirectory, "default.js"), "module.exports = {};", "utf8"),
    writeFile(path.join(clientDirectory, "schema.prisma"), schema, "utf8"),
    writeFile(path.join(clientDirectory, "index.d.ts"), declarations, "utf8")
  ]);
}

describe("findGeneratedPrismaClient", () => {
  it("prefers the active pnpm package client over an obsolete root client", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "oe-prisma-client-"));
    temporaryDirectories.push(rootDir);

    const sourceSchema = "model GoogleOAuthAttempt {\n  id String\n}\n";
    const compatibleDeclarations = "get googleOAuthAttempt(): GoogleOAuthAttemptDelegate;";
    const clientPackage = path.join(
      rootDir,
      "node_modules",
      ".pnpm",
      "@prisma+client@6.19.3_prisma-test",
      "node_modules",
      "@prisma",
      "client"
    );
    const activeClient = path.resolve(clientPackage, "..", "..", ".prisma", "client");
    const obsoleteRootClient = path.join(rootDir, "node_modules", ".prisma", "client");

    await mkdir(path.join(rootDir, "prisma"), { recursive: true });
    await mkdir(clientPackage, { recursive: true });
    await writeFile(path.join(rootDir, "prisma", "schema.prisma"), sourceSchema, "utf8");
    await createClientFixture(
      obsoleteRootClient,
      "model Patient {\n  id String\n}\n",
      "get patient(): PatientDelegate;"
    );
    await createClientFixture(
      activeClient,
      "model GoogleOAuthAttempt {\n  id String\n}\n",
      compatibleDeclarations
    );

    expect(findGeneratedPrismaClient(rootDir, clientPackage)).toBe(activeClient);
  });

  it("fails with a clear error when no generated client matches the schema", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "oe-prisma-client-"));
    temporaryDirectories.push(rootDir);

    const clientPackage = path.join(rootDir, "node_modules", "@prisma", "client");
    const generatedClient = path.resolve(clientPackage, "..", "..", ".prisma", "client");
    await mkdir(path.join(rootDir, "prisma"), { recursive: true });
    await mkdir(clientPackage, { recursive: true });
    await writeFile(
      path.join(rootDir, "prisma", "schema.prisma"),
      "model GoogleOAuthAttempt {\n  id String\n}\n",
      "utf8"
    );
    await createClientFixture(
      generatedClient,
      "model Patient {\n  id String\n}\n",
      "get patient(): PatientDelegate;"
    );

    expect(() => findGeneratedPrismaClient(rootDir)).toThrow(
      /compatible con prisma\/schema\.prisma.*pnpm exec prisma generate/
    );
  });
});
