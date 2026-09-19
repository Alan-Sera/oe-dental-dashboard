import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appDataRoot = process.env.APPDATA || process.env.LOCALAPPDATA;

if (!appDataRoot) {
  throw new Error("No se encontró APPDATA ni LOCALAPPDATA para guardar la base local.");
}

const dataDir = process.env.APP_DATA_DIR || path.join(appDataRoot, "OE Dental", "data");
const databasePath = path.join(dataDir, "app.db");
const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;
const migrationsDir = path.join(rootDir, "prisma", "migrations");

await mkdir(dataDir, { recursive: true });

console.log("[OE Dental] Database directory:", dataDir);
console.log("[OE Dental] Database:", databasePath);

await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(rootDir, "electron", "init-db.cjs")], {
    cwd: rootDir,
    env: {
      ...process.env,
      APP_DATA_DIR: dataDir,
      DATABASE_URL: databaseUrl,
      MIGRATIONS_DIR: migrationsDir,
    },
    stdio: "inherit",
    windowsHide: true,
  });

  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (code === 0) {
      resolve();
      return;
    }

    reject(new Error(`La inicialización terminó con code=${code}, signal=${signal}`));
  });
});

console.log("[OE Dental] Database initialized successfully.");
