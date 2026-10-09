/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, dialog, safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const HOST = "127.0.0.1";

let isQuitting = false;
let logFilePath = null;
let mainWindow = null;
let nextProcess = null;
let nextStartupError = "";
let googleTokenEncryptionKey = "";
let packagedGoogleOAuthConfig = {};

app.setName("OE Dental");

function getBootstrapLogPath() {
  const appDataPath = process.env.APPDATA || process.cwd();
  const bootstrapDir = path.join(appDataPath, "OE Dental");

  fs.mkdirSync(bootstrapDir, { recursive: true });

  return path.join(bootstrapDir, "electron.log");
}

try {
  fs.appendFileSync(
    getBootstrapLogPath(),
    `[${new Date().toISOString()}] [INFO] Electron main cargado. argv=${process.argv.join(" ")}\n`,
    "utf8"
  );
} catch {
  // El logger principal se configura cuando Electron termina de inicializar.
}

function formatLogArg(value) {
  if (value instanceof Error) {
    return `${value.stack || value.message}`;
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function writeLog(level, ...messages) {
  const line = `[${new Date().toISOString()}] [${level}] ${messages.map(formatLogArg).join(" ")}\n`;
  const stream = process[level === "ERROR" ? "stderr" : "stdout"];

  if (stream?.write) {
    stream.write(line);
  }

  if (!logFilePath) {
    return;
  }

  try {
    fs.appendFileSync(logFilePath, line, "utf8");
  } catch {
    // No se debe impedir el arranque por un error secundario de logging.
  }
}

function logInfo(...messages) {
  writeLog("INFO", ...messages);
}

function logWarn(...messages) {
  writeLog("WARN", ...messages);
}

function logError(...messages) {
  writeLog("ERROR", ...messages);
}

function setupFileLogging() {
  const userDataPath = app.getPath("userData");

  fs.mkdirSync(userDataPath, { recursive: true });
  logFilePath = path.join(userDataPath, "electron.log");
  logInfo("Log listo:", logFilePath);
}

function ensureGoogleTokenEncryptionKey() {
  const keyPath = path.join(app.getPath("userData"), "google-token-key.bin");

  if (fs.existsSync(keyPath)) {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("Windows no permitió descifrar la clave local de Google.");
    }
    googleTokenEncryptionKey = safeStorage.decryptString(fs.readFileSync(keyPath));
    return;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("Windows no ofrece almacenamiento seguro para proteger la conexión con Google.");
  }

  googleTokenEncryptionKey = crypto.randomBytes(32).toString("base64");
  fs.writeFileSync(keyPath, safeStorage.encryptString(googleTokenEncryptionKey), { flag: "wx" });
}

function loadPackagedGoogleOAuthConfig() {
  const configPath = app.isPackaged
    ? path.join(process.resourcesPath, "google-oauth.json")
    : path.join(getProjectRoot(), ".electron-build", "google-oauth.json");
  if (!fs.existsSync(configPath)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (typeof parsed.clientId === "string" && typeof parsed.clientSecret === "string") {
      packagedGoogleOAuthConfig = {
        GOOGLE_CLIENT_ID: parsed.clientId,
        GOOGLE_CLIENT_SECRET: parsed.clientSecret,
      };
    }
  } catch (error) {
    logWarn("[Electron] No se pudo leer la configuración OAuth empaquetada:", error);
  }
}

function getProjectRoot() {
  return path.resolve(__dirname, "..");
}

function getStandaloneDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "next");
  }

  return path.join(getProjectRoot(), ".electron-build", "next");
}

function getNextServerPath() {
  return path.join(getStandaloneDir(), "server.js");
}

function getDatabaseInitPath() {
  return path.join(getStandaloneDir(), "init-db.cjs");
}

function getNodeRuntimePath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "node.exe");
  }

  return process.env.OE_NODE_RUNTIME || process.env.npm_node_execpath || "node";
}

function getDevelopmentUrl() {
  const value = process.env.ELECTRON_DEV_SERVER_URL?.trim();

  if (!value) {
    return null;
  }

  const url = new URL(value);
  const isLoopback = url.hostname === HOST || url.hostname === "localhost";

  if (url.protocol !== "http:" || !isLoopback) {
    throw new Error("ELECTRON_DEV_SERVER_URL debe apuntar a un servidor HTTP local.");
  }

  return url.toString().replace(/\/$/, "");
}

function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();

      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("No se pudo reservar un puerto local para Next.js."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });
}

function runDatabaseInit(nodePath, dataDir, databaseUrl) {
  const initPath = getDatabaseInitPath();

  if (!fs.existsSync(initPath)) {
    throw new Error(`No existe el inicializador de base de datos: ${initPath}`);
  }

  const result = spawnSync(nodePath, [initPath], {
    cwd: getStandaloneDir(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NODE_PATH: path.join(getStandaloneDir(), "server_modules"),
      APP_DATA_DIR: dataDir,
      DATABASE_URL: databaseUrl,
      MIGRATIONS_DIR: path.join(getStandaloneDir(), "prisma", "migrations"),
    },
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.stdout) {
    logInfo(result.stdout.trim());
  }

  if (result.stderr) {
    logError(result.stderr.trim());
  }

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`No se pudo inicializar la base de datos. code=${result.status}`);
  }
}

function startNextServer(port) {
  const serverPath = getNextServerPath();
  const nodePath = getNodeRuntimePath();

  if (!fs.existsSync(serverPath)) {
    throw new Error(`No existe el servidor Next: ${serverPath}`);
  }

  if (path.isAbsolute(nodePath) && !fs.existsSync(nodePath)) {
    throw new Error(`No existe el runtime Node: ${nodePath}`);
  }

  const dataDir = path.join(app.getPath("userData"), "data");
  const databaseUrl = `file:${path.join(dataDir, "app.db").replace(/\\/g, "/")}`;

  fs.mkdirSync(dataDir, { recursive: true });

  logInfo("[Electron] User data:", app.getPath("userData"));
  logInfo("[Electron] APP_DATA_DIR:", dataDir);
  logInfo("[Electron] Node runtime:", nodePath);
  logInfo("[Electron] Next server:", serverPath);

  runDatabaseInit(nodePath, dataDir, databaseUrl);

  nextStartupError = "";
  nextProcess = spawn(nodePath, [serverPath], {
    cwd: getStandaloneDir(),
    env: {
      ...process.env,
      NODE_ENV: "production",
      NODE_PATH: path.join(getStandaloneDir(), "server_modules"),
      APP_DATA_DIR: dataDir,
      DATABASE_URL: databaseUrl,
      PORT: String(port),
      HOSTNAME: HOST,
      GOOGLE_TOKEN_ENCRYPTION_KEY: googleTokenEncryptionKey,
      ...packagedGoogleOAuthConfig,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const spawnedProcess = nextProcess;

  spawnedProcess.stdout.on("data", (data) => {
    logInfo("[Next]", data.toString().trim());
  });

  spawnedProcess.stderr.on("data", (data) => {
    const message = data.toString().trim();
    nextStartupError = `${nextStartupError}\n${message}`.trim().slice(-6000);
    logError("[Next error]", message);
  });

  spawnedProcess.on("error", (error) => {
    logError("[Electron] Error iniciando Next:", error);
  });

  spawnedProcess.on("exit", (code, signal) => {
    logInfo(`[Electron] Next terminó. code=${code}, signal=${signal}`);

    if (nextProcess === spawnedProcess) {
      nextProcess = null;
    }

    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      dialog.showErrorBox(
        "OE Dental perdió la conexión local",
        "El servidor local se cerró. Reinicia la aplicación para continuar."
      );
      app.quit();
    }
  });

  return spawnedProcess;
}

function waitForNext(targetUrl, spawnedProcess) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (spawnedProcess) {
        spawnedProcess.removeListener("exit", handleEarlyExit);
      }

      callback(value);
    };

    const handleEarlyExit = (code, signal) => {
      const details = nextStartupError
        ? `\n\nDetalle de Next.js:\n${nextStartupError}`
        : "";

      finish(
        reject,
        new Error(`Next.js terminó antes de iniciar (code=${code}, signal=${signal}).${details}`)
      );
    };

    const timeout = setTimeout(() => {
      finish(reject, new Error("Next.js no estuvo disponible después de 30 segundos"));
    }, 30000);

    if (spawnedProcess) {
      spawnedProcess.once("exit", handleEarlyExit);
    }

    const check = () => {
      if (settled) {
        return;
      }

      const request = http.get(targetUrl, (response) => {
        response.resume();
        logInfo("[Electron] Next.js está disponible en", targetUrl);
        finish(resolve);
      });

      request.on("error", () => {
        setTimeout(check, 300);
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });
    };

    check();
  });
}

function createWindow(targetUrl) {
  const localOrigin = new URL(targetUrl).origin;
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (isSameLocalOrigin(url, localOrigin)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });

  mainWindow.loadURL(targetUrl);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function isSameLocalOrigin(value, localOrigin) {
  try {
    const destination = new URL(value);
    const local = new URL(localOrigin);
    const loopbackHosts = new Set(["127.0.0.1", "localhost"]);

    return destination.protocol === "http:"
      && local.protocol === "http:"
      && loopbackHosts.has(destination.hostname)
      && loopbackHosts.has(local.hostname)
      && destination.port === local.port
      && !destination.username
      && !destination.password;
  } catch {
    return false;
  }
}

function isAllowedExternalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && [
      "accounts.google.com",
      "drive.google.com",
      "docs.google.com",
    ].includes(url.hostname);
  } catch {
    return false;
  }
}

async function startApplication() {
  setupFileLogging();
  ensureGoogleTokenEncryptionKey();
  loadPackagedGoogleOAuthConfig();
  logInfo("[Electron] App ready. packaged=", app.isPackaged);

  const developmentUrl = getDevelopmentUrl();

  if (developmentUrl) {
    await waitForNext(developmentUrl);
    createWindow(developmentUrl);
    return;
  }

  const port = await findAvailablePort();
  const targetUrl = `http://${HOST}:${port}`;
  const spawnedProcess = startNextServer(port);

  await waitForNext(targetUrl, spawnedProcess);
  createWindow(targetUrl);
}

function stopNextServer() {
  if (!nextProcess) {
    return;
  }

  nextProcess.kill();
  nextProcess = null;
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await startApplication();

      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          const developmentUrl = getDevelopmentUrl();

          if (developmentUrl) {
            createWindow(developmentUrl);
          }
        }
      });
    } catch (error) {
      logError("[Electron] Error:", error);
      dialog.showErrorBox(
        "OE Dental no pudo iniciar",
        `${error?.stack || error?.message || error}\n\nLog: ${logFilePath || "no disponible"}`
      );
      app.quit();
    }
  });

  app.on("before-quit", () => {
    isQuitting = true;
    stopNextServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
