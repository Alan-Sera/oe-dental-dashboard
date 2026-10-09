import { spawn } from "node:child_process";
import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "app.db");
const migrationsDir = path.join(rootDir, "prisma", "migrations");

await mkdir(dataDir, { recursive: true });

if ((await pathExists(dbPath)) && (await databaseNeedsReset(dbPath))) {
  await rm(dbPath, { force: true });
  console.log("Legacy vault schema detected. Local test database was reset for linked patient folders.");
}

await Promise.all([
  mkdir(path.join(dataDir, "backups"), { recursive: true }),
  mkdir(path.join(dataDir, "imports"), { recursive: true }),
  mkdir(path.join(dataDir, "cache"), { recursive: true })
]);

await runNode(path.join(rootDir, "electron", "init-db.cjs"), {
  APP_DATA_DIR: dataDir,
  DATABASE_URL: `file:${dbPath.replace(/\\/g, "/")}`,
  MIGRATIONS_DIR: migrationsDir
});

console.log(`SQLite database ready at ${dbPath}`);

async function databaseNeedsReset(databasePath) {
  const columns = await runSqlite(
    databasePath,
    "SELECT name FROM pragma_table_info('Attachment') WHERE name IN ('vaultPath','localRelativePath');"
  );
  return columns.includes("vaultPath") || !columns.includes("localRelativePath");
}

async function runNode(scriptPath, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: rootDir,
      env: { ...process.env, ...environment },
      stdio: "inherit",
      windowsHide: true
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(undefined);
      else reject(new Error(`Database initialization exited with code ${code}`));
    });
  });
}

async function runSqlite(databasePath, sql) {
  return new Promise((resolve, reject) => {
    let output = "";
    const child = spawn("sqlite3", [databasePath, sql], {
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true
    });
    child.stdout.on("data", (chunk) => {
      output += chunk.toString("utf8");
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve(output);
      else reject(new Error(`sqlite3 exited with code ${code}`));
    });
  });
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}
