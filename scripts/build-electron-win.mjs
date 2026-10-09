import { spawn } from "node:child_process";
import fs from "node:fs";
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

if (typeof process.loadEnvFile === "function") {
  const envPath = path.join(rootDir, ".env");
  if (fs.existsSync(envPath)) process.loadEnvFile(envPath);
}

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
  const schemaPath = path.join(rootDir, "prisma", "schema.prisma");
  const sourceSchema = fs.existsSync(schemaPath)
    ? fs.readFileSync(schemaPath, "utf8").replace(/\r\n/g, "\n")
    : null;
  const candidates = [];

  if (fs.existsSync(path.join(directClient, "default.js"))) {
    candidates.push(directClient);
  }

  const pnpmDir = path.join(rootDir, "node_modules", ".pnpm");

  if (fs.existsSync(pnpmDir)) {
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
        candidates.push(candidate);
      }
    }
  }

  for (const candidate of candidates) {
    const generatedSchemaPath = path.join(candidate, "schema.prisma");

    if (
      sourceSchema &&
      fs.existsSync(generatedSchemaPath) &&
      fs.readFileSync(generatedSchemaPath, "utf8").replace(/\r\n/g, "\n") === sourceSchema
    ) {
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
    "server_modules",
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

async function readElectronGoogleOAuthConfig() {
  const localConfigPath = path.join(rootDir, "electron", "google-oauth.local.json");

  if (!fs.existsSync(localConfigPath)) {
    throw new Error(
      "Falta electron/google-oauth.local.json. Copia electron/google-oauth.example.json y configura ahí el cliente OAuth Desktop antes de empaquetar."
    );
  }

  let localConfig;
  try {
    localConfig = JSON.parse(await readFile(localConfigPath, "utf8"));
  } catch {
    throw new Error(
      "electron/google-oauth.local.json no contiene JSON válido. Usa el formato de electron/google-oauth.example.json."
    );
  }

  if (!localConfig || typeof localConfig !== "object" || Array.isArray(localConfig)) {
    throw new Error(
      "electron/google-oauth.local.json debe ser un objeto con clientId y clientSecret. Usa el formato de electron/google-oauth.example.json."
    );
  }

  const clientId = typeof localConfig.clientId === "string" ? localConfig.clientId.trim() : "";
  const clientSecret = typeof localConfig.clientSecret === "string" ? localConfig.clientSecret.trim() : "";

  if (!clientId || !clientSecret) {
    throw new Error(
      "Faltan clientId o clientSecret en electron/google-oauth.local.json. El instalador requiere las credenciales OAuth Desktop."
    );
  }

  return { clientId, clientSecret };
}

async function prepareGoogleOAuthConfig(config) {
  const configPath = path.join(stageDir, "google-oauth.json");

  await writeFile(configPath, JSON.stringify(config), "utf8");
  console.log("[electron-build] Credenciales OAuth Desktop locales preparadas");
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
    "next",
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
    const target = path.join(stageNextDir, "server_modules", ...packageName.split("/"));

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

async function prepareStandalone(electronOAuthConfig) {
  const standaloneDir = path.join(rootDir, ".next", "standalone");
  const staticDir = path.join(rootDir, ".next", "static");
  const publicDir = path.join(rootDir, "public");
  const templatesDir = path.join(rootDir, "assets", "templates");
  const migrationsDir = path.join(rootDir, "prisma", "migrations");
  const electronInitDb = path.join(rootDir, "electron", "init-db.cjs");
  const standaloneNodeModulesDir = path.join(standaloneDir, "node_modules");
  const stageServerModulesDir = path.join(stageNextDir, "server_modules");

  if (!fs.existsSync(path.join(standaloneDir, "server.js"))) {
    throw new Error("No existe .next/standalone/server.js. Ejecuta next build.");
  }

  await rm(stageDir, { recursive: true, force: true });
  await mkdir(stageDir, { recursive: true });
  await prepareGoogleOAuthConfig(electronOAuthConfig);

  await cp(standaloneDir, stageNextDir, {
    recursive: true,
    dereference: true,
    filter: (source) => {
      const name = path.basename(source);

      return (
        !name.includes(".tmp") &&
        !/^\.env(?:\.|$)/i.test(name) &&
        path.resolve(source) !== standaloneNodeModulesDir
      );
    },
  });

  await copyIfExists(staticDir, path.join(stageNextDir, ".next", "static"));
  await copyIfExists(publicDir, path.join(stageNextDir, "public"));
  await copyIfExists(templatesDir, path.join(stageNextDir, "assets", "templates"));
  await copyIfExists(migrationsDir, path.join(stageNextDir, "prisma", "migrations"));
  await copyIfExists(electronInitDb, path.join(stageNextDir, "init-db.cjs"));
  await mkdir(stageServerModulesDir, { recursive: true });
  await copyRequiredRuntimePackages();
  await preparePrismaClient();
  await prepareNodeRuntime();

  if (!fs.existsSync(path.join(stageServerModulesDir, "next", "package.json"))) {
    throw new Error("No se preparó el paquete Next.js requerido por server.js.");
  }

  console.log("[electron-build] Standalone preparado en .electron-build/next");
}

const electronOAuthConfig = await readElectronGoogleOAuthConfig();

if (!stageOnly) {
  await run(pnpmBin, ["build"]);
}

await prepareStandalone(electronOAuthConfig);

if (!stageOnly) {
  await run(pnpmBin, ["exec", "electron-builder"]);
}
