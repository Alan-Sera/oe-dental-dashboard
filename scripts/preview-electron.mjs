import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const unpackedDir = path.join(rootDir, "release", "win-unpacked");

if (!fs.existsSync(unpackedDir)) {
  throw new Error(
    "No existe release/win-unpacked. Ejecuta primero pnpm electron:build."
  );
}

const preferredNames = [
  "OE Dental Dashboard.exe",
  "OE Dental.exe",
];

const exePath =
  preferredNames
    .map((name) => path.join(unpackedDir, name))
    .find((candidate) => fs.existsSync(candidate)) ??
  fs
    .readdirSync(unpackedDir)
    .filter((name) => name.toLowerCase().endsWith(".exe"))
    .filter((name) => name.toLowerCase() !== "elevate.exe")
    .map((name) => path.join(unpackedDir, name))[0];

if (!exePath) {
  throw new Error(`No se encontró un ejecutable en ${unpackedDir}.`);
}

console.log(`[electron-preview] Abriendo ${exePath}`);

const child = spawn(exePath, [], {
  cwd: path.dirname(exePath),
  detached: false,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
