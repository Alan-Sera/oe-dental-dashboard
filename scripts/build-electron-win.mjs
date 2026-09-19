import { spawn } from "node:child_process";
import fs from "node:fs";
import { copyFile, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

const pnpmBin = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const stageDir = path.join(rootDir, ".electron-build");
const stageNextDir = path.join(stageDir, "next");
const stageOnly = process.argv.includes("--stage-only");

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env: process.env,
      stdio: "inherit",
      shell: process.platform === "win32",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(`${command} ${args.join(" ")} failed with exit code ${code}`)
      );
    });
  });
}

async function copyIfExists(from, to) {
  if (!fs.existsSync(from)) {
    return;
  }

  await cp(from, to, {
    recursive: true,
    dereference: true,
    filter: (source) => !path.basename(source).includes(".tmp"),
  });
}

function findGeneratedPrismaClient() {
  const directClient = path.join(rootDir, "node_modules", ".prisma", "client");

  if (fs.existsSync(path.join(directClient, "default.js"))) {
    return directClient;
  }

  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");

  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith("@prisma+client@")) {
      continue;
    }

    const candidate = path.join(
      pnpmDir,
      entry,
      "node_modules",
      ".prisma",
      "client"
    );

    if (fs.existsSync(path.join(candidate, "default.js"))) {
      return candidate;
    }
  }

  return null;
}

async function preparePrismaClient() {
  const generatedClient = findGeneratedPrismaClient();

  if (!generatedClient) {
    throw new Error("No se encontró el cliente generado de Prisma.");
  }

  const targetClient = path.join(
    stageNextDir,
    "node_modules",
    "@prisma",
    "client"
  );

  if (!fs.existsSync(targetClient)) {
    throw new Error(
      `No se encontró @prisma/client en el standalone preparado: ${targetClient}`
    );
  }

  const targetGeneratedClient = path.join(
    targetClient,
    ".prisma",
    "client"
  );
  const targetVisibleClient = path.join(targetClient, "generated-client");

  await mkdir(path.dirname(targetGeneratedClient), { recursive: true });
  await rm(targetGeneratedClient, { recursive: true, force: true });
  await rm(targetVisibleClient, { recursive: true, force: true });
  await cp(generatedClient, targetGeneratedClient, {
    recursive: true,
    dereference: true,
    filter: (source) => !path.basename(source).includes(".tmp"),
  });
  await cp(generatedClient, targetVisibleClient, {
    recursive: true,
    dereference: true,
    filter: (source) => !path.basename(source).includes(".tmp"),
  });
  await patchPrismaEntrypoints(targetClient);

  console.log("[electron-build] Prisma client preparado en @prisma/client/generated-client");
}

async function prepareNodeRuntime() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("El instalador de Windows requiere ejecutar el build con Node para win32-x64.");
  }

  const runtimeDir = path.join(stageDir, "runtime");
  const runtimePath = path.join(runtimeDir, "node.exe");

  await mkdir(runtimeDir, { recursive: true });
  await copyFile(process.execPath, runtimePath);

  console.log(`[electron-build] Node ${process.version} copiado al staging temporal`);
}

function findPnpmPackage(packageName) {
  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");

  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  const packagePathParts = packageName.split("/");

  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith(`${packageName.replace("/", "+")}@`)) {
      continue;
    }

    const candidate = path.join(
      pnpmDir,
      entry,
      "node_modules",
      ...packagePathParts
    );

    if (fs.existsSync(path.join(candidate, "package.json"))) {
      return candidate;
    }
  }

  return null;
}

async function copyRequiredRuntimePackages() {
  const nextPackageDir = fs.realpathSync(path.join(rootDir, "node_modules", "next"));
  const nextPackage = JSON.parse(
    await readFile(path.join(nextPackageDir, "package.json"), "utf8")
  );
  const packagesToCopy = new Map();

  function resolveInstalledDependency(parentDir, packageName) {
    const packageParts = packageName.split("/");
    const candidates = [
      path.join(parentDir, "node_modules", ...packageParts),
      path.join(rootDir, "node_modules", ...packageParts),
    ];

    for (const candidate of candidates) {
      if (fs.existsSync(path.join(candidate, "package.json"))) {
        return fs.realpathSync(candidate);
      }
    }

    return findPnpmPackage(packageName);
  }

  async function collectPackage(packageName, packageDir) {
    if (packagesToCopy.has(packageName)) {
      return;
    }

    packagesToCopy.set(packageName, packageDir);

    const packageJson = JSON.parse(
      await readFile(path.join(packageDir, "package.json"), "utf8")
    );

    for (const dependencyName of Object.keys(packageJson.dependencies ?? {})) {
      const dependencyDir = resolveInstalledDependency(packageDir, dependencyName);

      if (!dependencyDir) {
        throw new Error(
          `No se encontró ${dependencyName}, requerido por ${packageName}.`
        );
      }

      await collectPackage(dependencyName, dependencyDir);
    }
  }

  const runtimeRoots = [
    ...Object.keys(nextPackage.dependencies ?? {}),
    "@prisma/client",
    "react",
    "react-dom",
    "sharp",
  ];

  for (const packageName of runtimeRoots) {
    const source = resolveInstalledDependency(nextPackageDir, packageName);

    if (!source) {
      throw new Error(`No se encontró el paquete runtime requerido: ${packageName}`);
    }

    await collectPackage(packageName, source);
  }

  if (process.platform === "win32" && process.arch === "x64") {
    const sharpSource = resolveInstalledDependency(nextPackageDir, "sharp");
    const sharpWindowsPackage = "@img/sharp-win32-x64";
    const sharpWindowsSource = sharpSource
      ? resolveInstalledDependency(sharpSource, sharpWindowsPackage)
      : null;

    if (!sharpWindowsSource) {
      throw new Error(
        `No se encontró el binario runtime requerido: ${sharpWindowsPackage}`
      );
    }

    await collectPackage(sharpWindowsPackage, sharpWindowsSource);
  }

  for (const [packageName, source] of packagesToCopy) {
    const target = path.join(stageNextDir, "node_modules", ...packageName.split("/"));

    await rm(target, { recursive: true, force: true });
    await cp(source, target, {
      recursive: true,
      dereference: true,
      filter: (sourcePath) => !path.basename(sourcePath).includes(".tmp"),
    });
  }

  console.log(
    `[electron-build] ${packagesToCopy.size} paquetes runtime de Next preparados`
  );
}

async function patchPrismaEntrypoints(prismaClientDir) {
  const entrypoints = [
    "default",
    "index",
    "edge",
    "extension",
    "react-native",
    "sql",
    "wasm",
  ];

  for (const entrypoint of entrypoints) {
    const jsPath = path.join(prismaClientDir, `${entrypoint}.js`);

    if (!fs.existsSync(jsPath)) {
      continue;
    }

    const source = await readFile(jsPath, "utf8");
    const patched = source.replaceAll(
      ".prisma/client/",
      "./generated-client/"
    );

    if (patched !== source) {
      await writeFile(jsPath, patched, "utf8");
    }
  }
}

async function prepareStandalone() {
  const standaloneDir = path.join(rootDir, ".next", "standalone");
  const staticDir = path.join(rootDir, ".next", "static");
  const publicDir = path.join(rootDir, "public");
  const migrationsDir = path.join(rootDir, "prisma", "migrations");
  const electronInitDb = path.join(rootDir, "electron", "init-db.cjs");
  const standaloneNodeModulesDir = path.join(standaloneDir, "node_modules");

  if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
    throw new Error("No existe .next/standalone/server.js. Ejecuta next build.");
  }

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });

  await cp(standaloneDir, stageNextDir, {
    recursive: true,
    dereference: true,
    filter: (source) =>
      !path.basename(source).includes(".tmp") &&
      path.resolve(source) !== standaloneNodeModulesDir,
  });

  await copyIfExists(staticDir, path.join(stageNextDir, ".next", "static"));
  await copyIfExists(publicDir, path.join(stageNextDir, "public"));
  await copyIfExists(migrationsDir, path.join(stageNextDir, "prisma", "migrations"));
  await copyIfExists(electronInitDb, path.join(stageNextDir, "init-db.cjs"));
  await mkdir(path.join(stageNextDir, "node_modules"), { recursive: true });
  await copyRequiredRuntimePackages();
  await preparePrismaClient();
  await prepareNodeRuntime();

  const stageNodeModulesDir = path.join(stageNextDir, "node_modules");
  const stageServerModulesDir = path.join(stageNextDir, "server_modules");

  await rm(stageServerModulesDir, { recursive: true, force: true });
  await rename(stageNodeModulesDir, stageServerModulesDir);

  console.log("[electron-build] Standalone preparado en .electron-build/next");
}

if (!stageOnly) {
  await run(pnpmBin, ["build"]);
}

await prepareStandalone();

if (!stageOnly) {
  await run(pnpmBin, ["exec", "electron-builder"]);
}
