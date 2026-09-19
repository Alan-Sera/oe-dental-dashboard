import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const STARTUP_TIMEOUT_MS = 90_000;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const electronExecutable = require("electron");
const nextCli = require.resolve("next/dist/bin/next");

let electronProcess = null;
let nextProcess = null;
let stopping = false;

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

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
      windowsHide: true,
    });

    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} terminó con code=${code}, signal=${signal}`));
    });
  });
}

function waitForUrl(targetUrl, child) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      child.removeListener("exit", handleEarlyExit);
      callback(value);
    };

    const handleEarlyExit = (code, signal) => {
      finish(
        reject,
        new Error(`Next.js terminó antes de iniciar (code=${code}, signal=${signal}).`)
      );
    };

    const timeout = setTimeout(() => {
      finish(reject, new Error("Next.js no estuvo disponible después de 90 segundos."));
    }, STARTUP_TIMEOUT_MS);

    child.once("exit", handleEarlyExit);

    const check = () => {
      if (settled) {
        return;
      }

      const request = http.get(targetUrl, (response) => {
        response.resume();
        finish(resolve);
      });

      request.on("error", () => {
        setTimeout(check, 250);
      });

      request.setTimeout(1000, () => {
        request.destroy();
      });
    };

    check();
  });
}

function stopChild(child) {
  if (child && !child.killed) {
    child.kill();
  }
}

function shutdown(exitCode = 0) {
  if (stopping) {
    return;
  }

  stopping = true;
  stopChild(electronProcess);
  stopChild(nextProcess);

  const forceExit = setTimeout(() => process.exit(exitCode), 2_000);
  forceExit.unref();
  process.exitCode = exitCode;
}

async function main() {
  const appDataRoot = process.env.APPDATA || process.env.LOCALAPPDATA;

  if (!appDataRoot) {
    throw new Error("No se encontró APPDATA ni LOCALAPPDATA para guardar la base local.");
  }

  const port = await findAvailablePort();
  const developmentUrl = `http://${HOST}:${port}`;
  const dataDir = process.env.APP_DATA_DIR || path.join(appDataRoot, "OE Dental", "data");
  const databaseUrl = `file:${path.join(dataDir, "app.db").replace(/\\/g, "/")}`;
  const sharedEnv = {
    ...process.env,
    APP_DATA_DIR: dataDir,
    DATABASE_URL: databaseUrl,
    ELECTRON_DEV_SERVER_URL: developmentUrl,
    HOSTNAME: HOST,
    PORT: String(port),
  };

  await run(process.execPath, [path.join(rootDir, "scripts", "init-electron-db.mjs")], sharedEnv);

  nextProcess = spawn(
    process.execPath,
    [nextCli, "dev", "--hostname", HOST, "--port", String(port)],
    {
      cwd: rootDir,
      env: sharedEnv,
      stdio: "inherit",
      windowsHide: true,
    }
  );

  nextProcess.once("error", (error) => {
    console.error("[electron-dev] No se pudo iniciar Next.js:", error);
    shutdown(1);
  });

  nextProcess.once("exit", (code) => {
    if (!stopping) {
      console.error(`[electron-dev] Next.js terminó inesperadamente con code=${code}.`);
      shutdown(code ?? 1);
    }
  });

  await waitForUrl(developmentUrl, nextProcess);
  console.log(`[electron-dev] Next.js listo en ${developmentUrl}`);

  electronProcess = spawn(electronExecutable, [path.join(rootDir, "electron", "main.cjs")], {
    cwd: rootDir,
    env: sharedEnv,
    stdio: "inherit",
    windowsHide: true,
  });

  electronProcess.once("error", (error) => {
    console.error("[electron-dev] No se pudo iniciar Electron:", error);
    shutdown(1);
  });

  electronProcess.once("exit", (code) => {
    shutdown(code ?? 0);
  });
}

process.once("SIGINT", () => shutdown(0));
process.once("SIGTERM", () => shutdown(0));

main().catch((error) => {
  console.error("[electron-dev] Error:", error);
  shutdown(1);
});
