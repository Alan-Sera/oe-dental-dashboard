/* eslint-disable @typescript-eslint/no-require-imports */

const { app, BrowserWindow, dialog, safeStorage, shell } = require("electron");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createPatientFileSyncStarter } = require("./patient-file-sync-starter.cjs");

const HOST = "127.0.0.1";

let isQuitting = false;
let logFilePath = null;
let mainWindow = null;
let allowedLocalOrigin = null;
let nextProcess = null;
let nextStartupError = "";
let googleTokenEncryptionKey = "";
let packagedGoogleOAuthConfig = {};
let fileSyncToken = "";
let fileSyncStarter = null;

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

  return new Promise((resolve, reject) => {
    const child = spawn(nodePath, [initPath], {
      cwd: getStandaloneDir(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        NODE_PATH: path.join(getStandaloneDir(), "server_modules"),
        APP_DATA_DIR: dataDir,
        DATABASE_URL: databaseUrl,
        MIGRATIONS_DIR: path.join(getStandaloneDir(), "prisma", "migrations"),
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (data) => logInfo(data.toString().trim()));
    child.stderr.on("data", (data) => logError(data.toString().trim()));
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`No se pudo inicializar la base de datos. code=${code}, signal=${signal}`));
    });
  });
}

async function startNextServer(port) {
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

  await runDatabaseInit(nodePath, dataDir, databaseUrl);

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
      APP_INTERNAL_SYNC_TOKEN: fileSyncToken,
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
      finish(reject, new Error("Next.js no estuvo disponible después de 90 segundos"));
    }, 90000);

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

function beginPatientFileSync(targetUrl, signal) {
  return new Promise((resolve, reject) => {
    const endpoint = new URL("/api/internal/patient-file-sync", targetUrl);
    const request = http.request(endpoint, {
      method: "POST",
      headers: { "x-oe-file-sync-token": fileSyncToken },
      timeout: 60_000,
      signal,
    }, (response) => {
      response.resume();
      if (response.statusCode === 202) resolve();
      else reject(new Error(`El servicio de archivos respondió ${response.statusCode}.`));
    });
    request.once("error", reject);
    request.once("timeout", () => request.destroy(new Error("Tiempo de espera agotado.")));
    request.end();
  });
}

function startPatientFileSync(targetUrl) {
  if (isQuitting) return;
  fileSyncStarter = createPatientFileSyncStarter({
    request: (signal) => beginPatientFileSync(targetUrl, signal),
    onRetry: (error, delayMs) => logWarn(`[file-sync] No se pudo iniciar; nuevo intento en ${delayMs / 1_000} s:`, error),
    onStarted: () => logInfo("[file-sync] Vigilancia iniciada."),
  });
  fileSyncStarter.start();
}

function createBrowserWindow(options) {
  mainWindow = new BrowserWindow(options);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (allowedLocalOrigin && isSameLocalOrigin(url, allowedLocalOrigin)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    allowedLocalOrigin = null;
  });
  return mainWindow;
}

function createStartupWindow() {
  const stagedLogoPath = path.join(getStandaloneDir(), "public", "assets", "brand", "muelita-oe.svg");
  const sourceLogoPath = path.join(getProjectRoot(), "public", "assets", "brand", "muelita-oe.svg");
  let logoDataUrl = "";
  try {
    const logoPath = fs.existsSync(stagedLogoPath) ? stagedLogoPath : sourceLogoPath;
    const logoSvg = fs.readFileSync(logoPath, "utf8");
    logoDataUrl = `data:image/svg+xml;base64,${Buffer.from(logoSvg).toString("base64")}`;
  } catch (error) {
    logWarn("[Electron] No se pudo cargar el logo del loader inicial:", error);
  }
  const logoMarkup = logoDataUrl
    ? `<img class="tooth" src="${logoDataUrl}" alt="">`
    : `<div class="tooth-fallback" aria-hidden="true">OE</div>`;
  const splashHtml = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0}body{display:grid;place-items:center;background:#f7f9fc;color:#172033;font-family:Segoe UI,system-ui,sans-serif}.loader{text-align:center}.frame{position:relative;display:grid;width:228px;height:228px;place-items:center;margin:0 auto 24px}.ring,.ring:before{position:absolute;inset:8px;border:1px solid rgba(116,157,229,.32);border-radius:50%;content:""}.ring:after{position:absolute;inset:0;border:2px solid transparent;border-top-color:#78baff;border-right-color:rgba(173,157,226,.8);border-radius:50%;content:"";animation:spin 1.7s linear infinite}.tooth{width:128px;height:90px;object-fit:contain;filter:drop-shadow(0 12px 22px rgba(48,63,94,.12))}.label{font-size:16px;font-weight:600;letter-spacing:.01em;color:#34415a}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.ring:after{animation:none}}
    .tooth-fallback{display:grid;width:112px;height:112px;place-items:center;border:4px solid #9f8fd2;border-radius:48% 48% 45% 45%;color:#6f61a2;font-size:30px;font-weight:700;letter-spacing:.08em}.tooth-fallback:after{position:absolute;content:"";width:70px;height:2px;background:#e5a0bd;transform:translateY(12px)}
    </style></head><body><main class="loader" role="status" aria-live="polite"><div class="frame"><div class="ring" aria-hidden="true"></div>${logoMarkup}</div><div class="label">Iniciando OE Dental…</div></main></body></html>`;
  const window = createBrowserWindow({
    width: 460,
    height: 360,
    minWidth: 460,
    minHeight: 360,
    resizable: false,
    show: false,
    backgroundColor: "#f7f9fc",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once("ready-to-show", () => window.show());
  void window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
}

function createWindow(targetUrl) {
  const localOrigin = new URL(targetUrl).origin;
  if (!mainWindow || mainWindow.isDestroyed()) {
    createBrowserWindow({
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
  }
  allowedLocalOrigin = localOrigin;
  mainWindow.setResizable(true);
  mainWindow.setMinimumSize(960, 640);
  mainWindow.setSize(1200, 800);
  mainWindow.center();
  mainWindow.setTitle("OE Dental");
  mainWindow.show();
  mainWindow.focus();
  mainWindow.loadURL(targetUrl);
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
  createStartupWindow();
  ensureGoogleTokenEncryptionKey();
  loadPackagedGoogleOAuthConfig();
  fileSyncToken = process.env.APP_INTERNAL_SYNC_TOKEN || crypto.randomBytes(32).toString("hex");
  logInfo("[Electron] App ready. packaged=", app.isPackaged);

  const developmentUrl = getDevelopmentUrl();

  if (developmentUrl) {
    await waitForNext(developmentUrl);
    createWindow(developmentUrl);
    startPatientFileSync(developmentUrl);
    return;
  }

  const port = await findAvailablePort();
  const targetUrl = `http://${HOST}:${port}`;
  const spawnedProcess = await startNextServer(port);

  await waitForNext(targetUrl, spawnedProcess);
  createWindow(targetUrl);
  startPatientFileSync(targetUrl);
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
    fileSyncStarter?.stop();
    stopNextServer();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
