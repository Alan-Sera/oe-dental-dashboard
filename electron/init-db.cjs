/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const migrationsDir = process.env.MIGRATIONS_DIR;
const dataDir = process.env.APP_DATA_DIR;

if (!migrationsDir) {
  throw new Error("MIGRATIONS_DIR no está configurado.");
}

if (!dataDir) {
  throw new Error("APP_DATA_DIR no está configurado.");
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(path.join(dataDir, "backups"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "imports"), { recursive: true });
fs.mkdirSync(path.join(dataDir, "cache"), { recursive: true });

const prisma = new PrismaClient();

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error("[Electron DB] Error:", error);
    process.exit(1);
  });

async function main() {
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys=ON");
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS "_oe_migrations" ("name" TEXT NOT NULL PRIMARY KEY, "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
  );

  const migrationDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const migrationName of migrationDirs) {
    const alreadyApplied = await prisma.$queryRawUnsafe(
      'SELECT "name" FROM "_oe_migrations" WHERE "name" = ? LIMIT 1',
      migrationName
    );

    if (alreadyApplied.length > 0) {
      continue;
    }

    const migrationPath = path.join(migrationsDir, migrationName, "migration.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    const statements = splitSqlStatements(sql);

    for (const statement of statements) {
      try {
        await prisma.$executeRawUnsafe(statement);
      } catch (error) {
        if (isDuplicateColumnError(error)) {
          continue;
        }

        throw error;
      }
    }

    await prisma.$executeRawUnsafe(
      'INSERT OR IGNORE INTO "_oe_migrations" ("name") VALUES (?)',
      migrationName
    );
  }

  console.log("[Electron DB] Base de datos lista.");
}

function splitSqlStatements(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

function isDuplicateColumnError(error) {
  const message = String(error?.message ?? "");

  return message.toLowerCase().includes("duplicate column name");
}
