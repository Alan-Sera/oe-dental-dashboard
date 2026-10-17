import fs from "node:fs";
import path from "node:path";

function readModelNames(schema) {
  return [...schema.matchAll(/^\s*model\s+(\w+)\s*\{/gm)].map((match) => match[1]);
}

function modelDelegateName(modelName) {
  return `${modelName.slice(0, 1).toLowerCase()}${modelName.slice(1)}`;
}

function isCompatibleClient(candidate, requiredModels) {
  const schemaPath = path.join(candidate, "schema.prisma");
  const declarationsPath = path.join(candidate, "index.d.ts");

  if (
    !fs.existsSync(path.join(candidate, "default.js")) ||
    !fs.existsSync(schemaPath) ||
    !fs.existsSync(declarationsPath)
  ) {
    return false;
  }

  const generatedModels = new Set(readModelNames(fs.readFileSync(schemaPath, "utf8")));
  if (!requiredModels.every((modelName) => generatedModels.has(modelName))) {
    return false;
  }

  const declarations = fs.readFileSync(declarationsPath, "utf8");
  return requiredModels.every((modelName) => {
    const delegateName = modelDelegateName(modelName);
    return new RegExp(`\\b${delegateName}\\b`).test(declarations);
  });
}

/**
 * Finds the generated Prisma client associated with the active @prisma/client
 * package and verifies it contains every model from the current schema.
 *
 * @param {string} rootDir
 * @param {string} [clientPackagePath]
 * @returns {string}
 */
export function findGeneratedPrismaClient(
  rootDir,
  clientPackagePath = path.join(rootDir, "node_modules", "@prisma", "client")
) {
  const sourceSchemaPath = path.join(rootDir, "prisma", "schema.prisma");
  if (!fs.existsSync(sourceSchemaPath)) {
    throw new Error(`No se encontró el esquema de Prisma: ${sourceSchemaPath}`);
  }

  const requiredModels = readModelNames(fs.readFileSync(sourceSchemaPath, "utf8"));
  if (requiredModels.length === 0) {
    throw new Error(`No se encontraron modelos en el esquema de Prisma: ${sourceSchemaPath}`);
  }

  let activeClientPackage;
  try {
    activeClientPackage = fs.realpathSync(clientPackagePath);
  } catch {
    throw new Error(`No se encontró el paquete @prisma/client activo: ${clientPackagePath}`);
  }

  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");
  const pnpmCandidates = fs.existsSync(pnpmDir)
    ? fs
        .readdirSync(pnpmDir)
        .filter((entry) => entry.startsWith("@prisma+client@"))
        .map((entry) => path.join(pnpmDir, entry, "node_modules", ".prisma", "client"))
    : [];
  const candidates = [
    path.resolve(activeClientPackage, "..", "..", ".prisma", "client"),
    path.join(rootDir, "node_modules", ".prisma", "client"),
    ...pnpmCandidates
  ];

  for (const candidate of new Set(candidates)) {
    if (isCompatibleClient(candidate, requiredModels)) {
      return candidate;
    }
  }

  const modelList = requiredModels.join(", ");
  throw new Error(
    `No se encontró un cliente Prisma generado compatible con prisma/schema.prisma. ` +
      `El cliente debe incluir estos modelos y sus delegados: ${modelList}. ` +
      "Ejecuta pnpm exec prisma generate y vuelve a compilar."
  );
}
