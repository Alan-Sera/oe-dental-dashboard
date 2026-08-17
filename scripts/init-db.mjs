import { spawn } from "node:child_process";
import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(root, "data");
const dbPath = path.join(dataDir, "app.db");
const migrationsRoot = path.join(root, "prisma", "migrations");

await Promise.all([
  mkdir(dataDir, { recursive: true }),
  mkdir(path.join(dataDir, "vault"), { recursive: true }),
  mkdir(path.join(dataDir, "backups"), { recursive: true }),
  mkdir(path.join(dataDir, "imports"), { recursive: true })
]);

const migrationDirs = (await readdir(migrationsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const sql = (
  await Promise.all(
    migrationDirs.map(async (directory) => readFile(path.join(migrationsRoot, directory, "migration.sql"), "utf8"))
  )
).join("\n\n");

await new Promise((resolve, reject) => {
  const child = spawn("sqlite3", [dbPath], {
    stdio: ["pipe", "inherit", "inherit"],
    windowsHide: true
  });

  child.on("error", reject);
  child.on("close", (code) => {
    if (code === 0) resolve(undefined);
    else reject(new Error(`sqlite3 exited with code ${code}`));
  });

  child.stdin.end(sql);
});

console.log(`SQLite database ready at ${dbPath}`);
